import { PutCommand, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { horseKey, parseHorseId } from './keys.js';
import type { Horse } from '@token-derby/shared';

export async function putHorse(race_id: string, horse: Horse, heartbeat_token: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...horseKey(race_id, horse.horse_id),
      ...horse,
      heartbeat_token,
    },
    ConditionExpression: 'attribute_not_exists(pk)',
  }));
}

export async function listHorses(race_id: string): Promise<Horse[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :hp)',
    ExpressionAttributeValues: {
      ':pk': `RACE#${race_id}`,
      ':hp': 'HORSE#',
    },
  }));
  return Items.map(pickHorse);
}

export async function updateHorseTokens(
  race_id: string,
  horse_id: string,
  current_tokens: number,
  last_heartbeat: string,
): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    UpdateExpression: 'SET current_tokens = :t, last_heartbeat = :h',
    ExpressionAttributeValues: {
      ':t': current_tokens,
      ':h': last_heartbeat,
    },
    ConditionExpression: 'attribute_exists(pk)',
  }));
}

export async function setHorseFinalTokens(
  race_id: string,
  horse_id: string,
  final_tokens: number,
): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    UpdateExpression: 'SET final_tokens = :f',
    ExpressionAttributeValues: { ':f': final_tokens },
  }));
}

export async function verifyHeartbeatToken(
  race_id: string,
  horse_id: string,
  heartbeat_token: string,
): Promise<boolean> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    ProjectionExpression: 'heartbeat_token',
  }));
  return Boolean(Item) && Item!.heartbeat_token === heartbeat_token;
}

export async function countHorses(race_id: string): Promise<number> {
  const { Count = 0 } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :hp)',
    ExpressionAttributeValues: {
      ':pk': `RACE#${race_id}`,
      ':hp': 'HORSE#',
    },
    Select: 'COUNT',
  }));
  return Count;
}

function pickHorse(item: Record<string, any>): Horse {
  const horse_id = parseHorseId(item.sk);
  if (!horse_id) throw new Error(`not a horse item: ${item.sk}`);
  const { pk: _pk, sk: _sk, heartbeat_token: _hb, ...rest } = item;
  return { ...rest, horse_id } as Horse;
}
