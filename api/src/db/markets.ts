import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { RACE_PK_PREFIX } from './keys.js';
import type { MarketSnapshot } from '@token-derby/shared';

export const HISTORY_INTERVAL_MIN = 5;
export const HISTORY_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

// Current snapshot: overwritten every minute, read with a GetItem on the hot
// path. History: appended every HISTORY_INTERVAL_MIN, queried by prefix. Kept
// as separate sk namespaces on purpose — collapsing them would turn the
// hot-path read into a query and make "current" ambiguous during a write race.
const CURRENT_SK = 'MARKETS';
const HISTORY_PREFIX = 'MARKETS#';
const historySk = (bucket: number): string => HISTORY_PREFIX + String(bucket).padStart(12, '0');

export async function getSnapshot(race_id: string): Promise<MarketSnapshot | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { pk: `${RACE_PK_PREFIX}${race_id}`, sk: CURRENT_SK },
  }));
  if (!Item) return null;
  const { pk: _pk, sk: _sk, ...rest } = Item;
  return rest as MarketSnapshot;
}

export async function putSnapshot(snap: MarketSnapshot): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { pk: `${RACE_PK_PREFIX}${snap.race_id}`, sk: CURRENT_SK, ...snap },
  }));
}

// History rows carry a `ttl` in epoch SECONDS (DynamoDB TTL's required unit),
// set to the snapshot's own computed_at instant plus the retention window —
// a ms value here would silently never expire.
export async function appendHistory(snap: MarketSnapshot, ttlMs: number): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      pk: `${RACE_PK_PREFIX}${snap.race_id}`,
      sk: historySk(snap.bucket),
      ttl: Math.floor((snap.bucket * 60_000 + ttlMs) / 1000),
      ...snap,
    },
  }));
}

// Zero-padded bucket in the sort key is what makes begins_with return
// chronological order — without it, bucket 100 sorts after bucket 1000.
export async function listHistory(race_id: string): Promise<MarketSnapshot[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': `${RACE_PK_PREFIX}${race_id}`,
      ':sk': HISTORY_PREFIX,
    },
  }));
  return Items.map((it) => {
    const { pk: _pk, sk: _sk, ttl: _ttl, ...rest } = it;
    return rest as MarketSnapshot;
  });
}
