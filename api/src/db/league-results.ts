import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgLeagueSeasonResultKey } from './keys.js';
import type { LeagueSeasonResult } from '@token-derby/shared';

export async function putSeasonResultIfAbsent(result: LeagueSeasonResult): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { ...orgLeagueSeasonResultKey(result.org_id, result.season), ...result },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
  } catch (e: any) {
    if (e?.name !== 'ConditionalCheckFailedException') throw e;
  }
}

export async function getSeasonResult(org_id: string, season: number): Promise<LeagueSeasonResult | null> {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: orgLeagueSeasonResultKey(org_id, season) }));
  if (!Item) return null;
  const { pk: _pk, sk: _sk, ...rest } = Item;
  return rest as LeagueSeasonResult;
}
