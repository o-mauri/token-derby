import { PutCommand, GetCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgLeagueKey } from './keys.js';
import type { League } from '@token-derby/shared';

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
