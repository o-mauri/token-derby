import { PutCommand, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { raceMetaKey } from './keys.js';
import type { Race } from '@token-derby/shared';

export async function putRace(race: Race, admin_code: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...raceMetaKey(race.race_id),
      ...race,
      admin_code,
    },
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
}

export async function getRaceById(race_id: string): Promise<Race | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: raceMetaKey(race_id),
  }));
  if (!Item) return null;
  return pickRace(Item);
}

export async function getRaceByJoinCode(join_code: string): Promise<Race | null> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'JoinCodeIndex',
    KeyConditionExpression: 'join_code = :c',
    ExpressionAttributeValues: { ':c': join_code },
    Limit: 1,
  }));
  const item = Items[0];
  return item ? pickRace(item) : null;
}

export async function getRaceByAdminCode(admin_code: string): Promise<Race | null> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'AdminCodeIndex',
    KeyConditionExpression: 'admin_code = :c',
    ExpressionAttributeValues: { ':c': admin_code },
    Limit: 1,
  }));
  const item = Items[0];
  return item ? pickRace(item) : null;
}

export async function setRaceEnded(race_id: string, ended_at: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: raceMetaKey(race_id),
    UpdateExpression: 'SET ended_at = :e',
    ExpressionAttributeValues: { ':e': ended_at },
  }));
}

// Conditional finalisation lock — only the first caller persists ended_at and
// wins the right to do downstream side-effects (final_tokens, future gold).
// Returns the persisted ended_at: either the value we just wrote, or the value
// the winning caller wrote if we lost the race.
export async function setRaceEndedIfAbsent(race_id: string, ended_at: string): Promise<string> {
  try {
    const res = await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: raceMetaKey(race_id),
      UpdateExpression: 'SET ended_at = :e',
      ConditionExpression: 'attribute_not_exists(ended_at)',
      ExpressionAttributeValues: { ':e': ended_at },
      ReturnValues: 'ALL_NEW',
    }));
    return String(res.Attributes?.ended_at ?? ended_at);
  } catch (e: any) {
    if (e?.name !== 'ConditionalCheckFailedException') throw e;
    const existing = await getRaceById(race_id);
    return existing?.ended_at ?? ended_at;
  }
}

export async function listRacesByOrgId(org_id: string): Promise<Race[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    IndexName: 'OrgRacesIndex',
    KeyConditionExpression: 'org_id = :o',
    ExpressionAttributeValues: { ':o': org_id },
    ScanIndexForward: false,
  }));
  return Items.map(pickRace);
}

function pickRace(item: Record<string, any>): Race {
  const { pk: _pk, sk: _sk, admin_code: _admin, ...rest } = item;
  return rest as Race;
}
