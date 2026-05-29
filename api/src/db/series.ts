import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { seriesPointKey, seriesPointPrefix, RACE_PK_PREFIX } from './keys.js';
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
