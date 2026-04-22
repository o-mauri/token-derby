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

function pickRace(item: Record<string, any>): Race {
  const { pk: _pk, sk: _sk, admin_code: _admin, ...rest } = item;
  return rest as Race;
}
