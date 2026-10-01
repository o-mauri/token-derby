// Fitted attendance habits, one row per player per org plus the org fallback.
import { BatchGetCommand, BatchWriteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { habitKey, habitMatrixKey, HABIT_SK_PREFIX, ORG_PK_PREFIX } from './keys.js';

export const ORG_HABIT_ID = 'ORG';

export type HabitSummary = {
  user_id: string;
  is_debutant: boolean;
  login_propensity: number;
  avg_daily_race_hours: number;
  peak_activity_window: { start: string; end: string };
  hourly_probability_array: number[];
  span_count: number;
  stable_horse_id?: string;   // the horse they raced most recently in this org
  last_updated: string;
};

export type HabitRow = HabitSummary & { habit_matrix_data: string };

const SUMMARY_FIELDS = [
  'user_id', 'is_debutant', 'login_propensity', 'avg_daily_race_hours', 'peak_activity_window',
  'hourly_probability_array', 'span_count', 'stable_horse_id', 'last_updated',
];

const MAX_ATTEMPTS = 8;

/** Re-sends whatever DynamoDB left unprocessed, backing off between attempts. */
async function drainUnprocessed<T>(items: T[], send: (batch: T[]) => Promise<T[]>): Promise<void> {
  let pending = items;
  for (let attempt = 0; pending.length > 0; attempt++) {
    if (attempt >= MAX_ATTEMPTS) throw new Error(`${pending.length} habit items still unprocessed after ${MAX_ATTEMPTS} attempts`);
    if (attempt > 0) await new Promise((r) => setTimeout(r, Math.min(2000, 50 * 2 ** attempt)));
    pending = await send(pending);
  }
}

// The matrix is its own item so listing summaries never reads it.
export async function putHabitRows(org_id: string, rows: HabitRow[]): Promise<void> {
  const itemsOf = (r: HabitRow): any[] => {
    const { habit_matrix_data, ...summary } = r;
    return [
      { PutRequest: { Item: { ...habitMatrixKey(org_id, r.user_id), user_id: r.user_id, habit_matrix_data, last_updated: r.last_updated } } },
      { PutRequest: { Item: { ...habitKey(org_id, r.user_id), ...summary } } },
    ];
  };
  // The ORG row goes last so a reader never sees its new stamp before the user rows.
  const send = async (requests: any[]) => {
    for (let i = 0; i < requests.length; i += 25) {
      await drainUnprocessed(requests.slice(i, i + 25), async (batch) => {
        const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [TABLE]: batch } }));
        return res.UnprocessedItems?.[TABLE] ?? [];
      });
    }
  };
  await send(rows.filter((r) => r.user_id !== ORG_HABIT_ID).flatMap(itemsOf));
  await send(rows.filter((r) => r.user_id === ORG_HABIT_ID).flatMap(itemsOf));
}

export async function listHabitSummaries(org_id: string): Promise<HabitSummary[]> {
  const out: HabitSummary[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': `${ORG_PK_PREFIX}${org_id}`, ':sk': HABIT_SK_PREFIX },
      ProjectionExpression: SUMMARY_FIELDS.map((_, i) => `#f${i}`).join(', '),
      ExpressionAttributeNames: Object.fromEntries(SUMMARY_FIELDS.map((f, i) => [`#f${i}`, f])),
      ExclusiveStartKey,
    }));
    for (const item of res.Items ?? []) {
      // The fit claim can create the org row before any habit is written.
      if (typeof item.login_propensity === 'number') out.push(item as HabitSummary);
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

export async function getHabitMatrices(org_id: string, user_ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(user_ids)];
  for (let i = 0; i < unique.length; i += 100) {
    const keys: Record<string, any>[] = unique.slice(i, i + 100).map((u) => habitMatrixKey(org_id, u));
    await drainUnprocessed(keys, async (batch) => {
      const res = await ddb.send(new BatchGetCommand({
        RequestItems: { [TABLE]: { Keys: batch, ProjectionExpression: 'user_id, habit_matrix_data' } },
      }));
      for (const item of res.Responses?.[TABLE] ?? []) {
        if (typeof item.habit_matrix_data === 'string') out.set(String(item.user_id), item.habit_matrix_data);
      }
      return (res.UnprocessedKeys?.[TABLE]?.Keys as Record<string, any>[] | undefined) ?? [];
    });
  }
  return out;
}

/** True when this caller may fit; a claim older than `staleMs` is treated as abandoned. */
export async function claimHabitFit(org_id: string, nowMs: number, staleMs: number): Promise<boolean> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: habitKey(org_id, ORG_HABIT_ID),
      UpdateExpression: 'SET fit_started_at = :now',
      ConditionExpression: 'attribute_not_exists(fit_started_at) OR fit_started_at < :stale',
      ExpressionAttributeValues: {
        ':now': new Date(nowMs).toISOString(),
        ':stale': new Date(nowMs - staleMs).toISOString(),
      },
    }));
    return true;
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}
