import { PutCommand, QueryCommand, ScanCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { seriesPointKey, seriesPointPrefix, RACE_PK_PREFIX, POINT_SK_PREFIX } from './keys.js';
import type { SeriesPoint } from '@token-derby/shared';

// Idempotent append: keyed on seq, conditional on the point not already
// existing, so a retried heartbeat with the same seq never double-writes.
export async function appendSeriesPoint(
  race_id: string,
  horse_id: string,
  seq: number,
  point: SeriesPoint,
): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { ...seriesPointKey(race_id, horse_id, seq), t: point.t, d: point.d },
      ConditionExpression: 'attribute_not_exists(sk)',
    }));
  } catch (e: any) {
    if (e?.name !== 'ConditionalCheckFailedException') throw e;
  }
}

export async function listSeriesPoints(race_id: string, horse_id: string): Promise<SeriesPoint[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sp)',
    ExpressionAttributeValues: {
      ':pk': `${RACE_PK_PREFIX}${race_id}`,
      ':sp': seriesPointPrefix(horse_id),
    },
  }));
  return Items.map(i => ({ t: Number(i.t ?? 0), d: Number(i.d ?? 0) }));
}

// The most recent `limit` points for a horse. Points are keyed by zero-padded
// seq, and seq is monotonic at ≤1/minute, so the newest N by seq are the newest
// N minutes — enough to cover a trailing pace window without reading the whole
// (potentially long) series. Returned newest-first; callers filter by `t`.
export async function listRecentSeriesPoints(
  race_id: string,
  horse_id: string,
  limit: number,
): Promise<SeriesPoint[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sp)',
    ExpressionAttributeValues: {
      ':pk': `${RACE_PK_PREFIX}${race_id}`,
      ':sp': seriesPointPrefix(horse_id),
    },
    ScanIndexForward: false, // newest seq first
    Limit: limit,
  }));
  return Items.map(i => ({ t: Number(i.t ?? 0), d: Number(i.d ?? 0) }));
}

// Periodic maintenance sweep: delete every series point whose timestamp is
// older than `cutoffMs`, keeping the table small. Points are the bulk of items,
// so a full-table Scan (projecting only the keys, filtered to POINT# rows below
// the cutoff) is acceptable for a job that runs on a slow cadence. Deletes are
// batched 25 at a time, retrying any unprocessed keys. Only POINT# rows are ever
// touched — race/horse/org rows have no `t` and don't match the filter. Returns
// the number of points removed. (A race that straddles the cutoff keeps its
// newer points; the finished-race chart hides itself once ALL points are gone.)
export async function pruneSeriesPointsOlderThan(cutoffMs: number): Promise<number> {
  const keys: { pk: string; sk: string }[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const out = await ddb.send(new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: 'pk, sk',
      FilterExpression: 'begins_with(sk, :p) AND #t < :cutoff',
      ExpressionAttributeNames: { '#t': 't' },
      ExpressionAttributeValues: { ':p': POINT_SK_PREFIX, ':cutoff': cutoffMs },
      ExclusiveStartKey,
    }));
    for (const it of out.Items ?? []) keys.push({ pk: String(it.pk), sk: String(it.sk) });
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  let deleted = 0;
  for (let i = 0; i < keys.length; i += 25) {
    let batch = keys.slice(i, i + 25);
    for (let attempt = 0; attempt < 5 && batch.length > 0; attempt++) {
      const res = await ddb.send(new BatchWriteCommand({
        RequestItems: { [TABLE]: batch.map(Key => ({ DeleteRequest: { Key } })) },
      }));
      const unprocessed = (res.UnprocessedItems?.[TABLE] ?? []);
      deleted += batch.length - unprocessed.length;
      batch = unprocessed.map(u => u.DeleteRequest!.Key as { pk: string; sk: string });
    }
  }
  return deleted;
}
