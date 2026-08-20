import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgLeagueStandingKey, orgLeagueStandingsPrefix } from './keys.js';
import { getUserNamesByIds } from './users.js';
import type { LeagueStanding } from '@token-derby/shared';

export async function listSeasonStandings(org_id: string, season: number): Promise<LeagueStanding[]> {
  const { pk, skPrefix } = orgLeagueStandingsPrefix(org_id, season);
  const out: LeagueStanding[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :p)',
      ExpressionAttributeValues: { ':pk': pk, ':p': skPrefix },
      ExclusiveStartKey,
    }));
    for (const it of res.Items ?? []) {
      const { pk: _pk, sk: _sk, scored_rounds: _sr, ...rest } = it;
      out.push(rest as LeagueStanding);
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  // The table shows who these people are now; the stored user_name is the
  // entry-time fallback for a user row that no longer exists.
  const names = await getUserNamesByIds(out.map(s => s.user_id));
  return out.map(s => ({ ...s, user_name: names.get(s.user_id) ?? s.user_name }));
}

/** stable_horse_id -> division. No name resolution — safe on polled paths. */
export async function listSeasonStandingDivisions(
  org_id: string, season: number,
): Promise<Map<string, number>> {
  const { pk, skPrefix } = orgLeagueStandingsPrefix(org_id, season);
  const out = new Map<string, number>();
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :p)',
      ExpressionAttributeValues: { ':pk': pk, ':p': skPrefix },
      ProjectionExpression: 'stable_horse_id, division',
      ExclusiveStartKey,
    }));
    for (const it of res.Items ?? []) {
      if (it.stable_horse_id) out.set(String(it.stable_horse_id), Number(it.division));
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

// Create a standing row if absent (a new entrant). No-op when it already exists.
export async function ensureStanding(s: LeagueStanding): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { ...orgLeagueStandingKey(s.org_id, s.season, s.division, s.stable_horse_id), ...s },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
  } catch (e: any) {
    if (e?.name !== 'ConditionalCheckFailedException') throw e;
  }
}

// Add this fixture's points/tokens to a standing, guarded so a given round
// scores at most once per horse. Uses a `scored_rounds` number-set rather than a
// high-water mark, so it's idempotent AND order-independent: re-finalising a
// race no-ops, and an earlier round finalising after a later one (possible under
// the app's lazy per-race finalisation) still applies correctly. Requires the
// standing row to exist (ensureStanding first).
export async function addStandingPointsForRound(
  org_id: string, season: number, division: number, stable_horse_id: string,
  points: number, tokens: number, round: number,
): Promise<void> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: orgLeagueStandingKey(org_id, season, division, stable_horse_id),
      UpdateExpression: 'ADD points :p, season_tokens :t, scored_rounds :rs',
      ConditionExpression: 'attribute_not_exists(scored_rounds) OR NOT contains(scored_rounds, :r)',
      ExpressionAttributeValues: { ':p': points, ':t': tokens, ':rs': new Set([round]), ':r': round },
    }));
  } catch (e: any) {
    if (e?.name !== 'ConditionalCheckFailedException') throw e; // already scored this round
  }
}

// Claim the season-prize award for one standing row exactly once. Returns true if
// this call set the mark (caller should then award XP), false if already marked or
// the row is missing. Mark-then-award ⇒ at-most-once minting.
export async function tryMarkPrizeAwarded(
  org_id: string, season: number, division: number, stable_horse_id: string,
): Promise<boolean> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: orgLeagueStandingKey(org_id, season, division, stable_horse_id),
      UpdateExpression: 'SET prize_awarded = :t',
      ConditionExpression: 'attribute_exists(pk) AND attribute_not_exists(prize_awarded)',
      ExpressionAttributeValues: { ':t': true },
    }));
    return true;
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}
