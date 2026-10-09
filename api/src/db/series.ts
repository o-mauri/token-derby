import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { seriesPointKey, seriesPointPrefix, RACE_PK_PREFIX } from './keys.js';
import type { SeriesPoint } from '@token-derby/shared';

// Series points (the per-heartbeat chart data) are the bulk of the table and
// only power the finished-race token graphs. We keep two weeks of them, then let
// DynamoDB's native TTL delete them for free — no maintenance sweep. Beyond the
// window a finished race still shows its standings/podium, just no graph (the
// chart hides itself when a race has no points).
export const SERIES_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

// Idempotent append: keyed on seq, conditional on the point not already
// existing, so a retried heartbeat with the same seq never double-writes. Each
// point carries a `ttl` (epoch SECONDS — DynamoDB TTL's required unit) of
// `t + SERIES_RETENTION_MS`, so the point self-expires ~2 weeks after its own
// timestamp with no prune job.
export async function appendSeriesPoint(
  race_id: string,
  horse_id: string,
  seq: number,
  point: SeriesPoint,
): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...seriesPointKey(race_id, horse_id, seq),
        t: point.t,
        d: point.d,
        // Only when a mechanic changed the beat. Storing it unconditionally
        // would repeat `d` on every point of every race that runs none.
        ...(point.s !== undefined ? { s: point.s } : {}),
        ttl: Math.floor((point.t + SERIES_RETENTION_MS) / 1000),
      },
      ConditionExpression: 'attribute_not_exists(sk)',
    }));
  } catch (e: any) {
    if (e?.name !== 'ConditionalCheckFailedException') throw e;
  }
}

// Restate one beat's point by a signed amount, keeping the chart's total equal to
// the horse's. A beat the server never applied has no point, so one is made. The
// result never goes below zero, so a point cannot plot negative pace.
export async function adjustSeriesPoint(
  race_id: string,
  horse_id: string,
  seq: number,
  adjustment: { d: number; s: number; now: number },
): Promise<void> {
  const key = seriesPointKey(race_id, horse_id, seq);
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: key }));
  const existing = Item ? readPoint(Item) : undefined;
  const t = existing?.t ?? adjustment.now;
  const d = Math.max(0, (existing?.d ?? 0) + adjustment.d);
  const s = Math.max(0, (existing?.s ?? existing?.d ?? 0) + adjustment.s);
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...key,
      t,
      d,
      ...(s !== d ? { s } : {}),
      ttl: Math.floor((t + SERIES_RETENTION_MS) / 1000),
    },
  }));
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
  return Items.map(readPoint);
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
  return Items.map(readPoint);
}

/** A stored point. `s` stays absent for a beat nothing modified. */
function readPoint(i: Record<string, unknown>): SeriesPoint {
  return {
    t: Number(i.t ?? 0),
    d: Number(i.d ?? 0),
    ...(i.s === undefined ? {} : { s: Number(i.s) }),
  };
}
