import { PutCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { orgLeagueSeasonKey } from './keys.js';
import type { LeagueSeason } from '@token-derby/shared';

export async function getLeagueSeason(org_id: string, season: number): Promise<LeagueSeason | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: orgLeagueSeasonKey(org_id, season),
  }));
  if (!Item) return null;
  const { pk: _pk, sk: _sk, ...rest } = Item;
  return rest as LeagueSeason;
}

// Create the season row if it doesn't exist yet. No-op when present (a losing
// concurrent tick just fails the condition). Mirrors the put-if-absent idiom.
export async function ensureLeagueSeason(org_id: string, season: number): Promise<void> {
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...orgLeagueSeasonKey(org_id, season),
        org_id,
        season,
        status: 'active',
        fixtures_materialised: 0,
        created_at: new Date().toISOString(),
      },
      ConditionExpression: 'attribute_not_exists(pk)',
    }));
  } catch (e: any) {
    if (e?.name !== 'ConditionalCheckFailedException') throw e;
  }
}

// Atomically claim the next fixture for `localDate`: stamp the date and bump the
// counter in one conditional write. Succeeds only if the season row exists, today
// hasn't already been claimed, and the season isn't full. Returns the NEW
// fixtures_materialised (the round number just claimed), or null if refused.
export async function tryClaimLeagueFixture(
  org_id: string,
  season: number,
  localDate: string,
  racesPerSeason: number,
): Promise<number | null> {
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: orgLeagueSeasonKey(org_id, season),
      UpdateExpression: 'SET last_materialised_date = :d ADD fixtures_materialised :one',
      ConditionExpression:
        'attribute_exists(pk) AND (attribute_not_exists(last_materialised_date) OR last_materialised_date <> :d) AND fixtures_materialised < :cap',
      ExpressionAttributeValues: { ':d': localDate, ':one': 1, ':cap': racesPerSeason },
      ReturnValues: 'UPDATED_NEW',
    }));
    return Number(res.Attributes?.fixtures_materialised);
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return null;
    throw e;
  }
}
