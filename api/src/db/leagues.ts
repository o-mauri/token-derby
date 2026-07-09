import { PutCommand, GetCommand, DeleteCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgLeagueKey } from './keys.js';
import type { League, PendingStructural } from '@token-derby/shared';

// Forward-compat: Phase B adds a GSI on this marker to list all leagues for the
// materialisation tick. Stamping it now means Phase-A rows are visible then.
const LEAGUE_MARKER = 'LEAGUE';

export async function putLeague(league: League): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...orgLeagueKey(league.org_id),
      ...league,
      league_marker: LEAGUE_MARKER,
    },
  }));
}

export async function getLeague(org_id: string): Promise<League | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: orgLeagueKey(org_id),
  }));
  return Item ? pickLeague(Item) : null;
}

export async function deleteLeague(org_id: string): Promise<void> {
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: orgLeagueKey(org_id),
  }));
}

export const LEAGUES_INDEX = 'LeaguesIndex';

export async function listAllLeagues(): Promise<League[]> {
  const out: League[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: LEAGUES_INDEX,
      KeyConditionExpression: 'league_marker = :m',
      ExpressionAttributeValues: { ':m': LEAGUE_MARKER },
      ExclusiveStartKey,
    }));
    for (const it of res.Items ?? []) out.push(pickLeague(it));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

function pickLeague(item: Record<string, any>): League {
  const { pk: _pk, sk: _sk, league_marker: _m, ...rest } = item;
  return rest as League;
}

// The rollover commit: atomically bump current_season fromSeason → fromSeason+1,
// apply the staged structural fields (if any), and clear pending_structural.
// Guarded on current_season still being fromSeason ⇒ exactly one caller commits.
// Returns true if this call performed the bump, false if another already did.
export async function commitRollover(
  org_id: string, fromSeason: number, applied: PendingStructural | null,
): Promise<boolean> {
  const sets: string[] = ['current_season = :next'];
  const values: Record<string, unknown> = { ':from': fromSeason, ':next': fromSeason + 1 };
  if (applied?.divisions !== undefined) { sets.push('divisions = :d'); values[':d'] = applied.divisions; }
  if (applied?.boundaries !== undefined) { sets.push('boundaries = :b'); values[':b'] = applied.boundaries; }
  if (applied?.races_per_season !== undefined) { sets.push('races_per_season = :r'); values[':r'] = applied.races_per_season; }
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: orgLeagueKey(org_id),
      UpdateExpression: `SET ${sets.join(', ')} REMOVE pending_structural`,
      ConditionExpression: 'attribute_exists(pk) AND current_season = :from',
      ExpressionAttributeValues: values,
    }));
    return true;
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}
