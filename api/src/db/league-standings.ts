import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgLeagueStandingKey, orgLeagueStandingsPrefix } from './keys.js';
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
