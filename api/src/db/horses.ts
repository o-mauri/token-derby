import { PutCommand, QueryCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { horseKey, parseHorseId, RACE_PK_PREFIX, HORSE_SK_PREFIX } from './keys.js';
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
      ':pk': `${RACE_PK_PREFIX}${race_id}`,
      ':hp': HORSE_SK_PREFIX,
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
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: horseKey(race_id, horse_id),
      UpdateExpression: 'SET final_tokens = :f',
      ConditionExpression: 'attribute_not_exists(final_tokens)',
      ExpressionAttributeValues: { ':f': final_tokens },
    }));
  } catch (e: any) {
    if (e?.name !== 'ConditionalCheckFailedException') throw e;
  }
}

export type HorseHeartbeatRecord = {
  current_tokens: number;
  last_heartbeat: string;
};

export async function getHorseForHeartbeat(
  race_id: string,
  horse_id: string,
  heartbeat_token: string,
): Promise<HorseHeartbeatRecord | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    ProjectionExpression: 'heartbeat_token, current_tokens, last_heartbeat',
  }));
  if (!Item || Item.heartbeat_token !== heartbeat_token) return null;
  return {
    current_tokens: Number(Item.current_tokens ?? 0),
    last_heartbeat: String(Item.last_heartbeat ?? ''),
  };
}

export async function findHorseByUser(race_id: string, user_id: string): Promise<Horse | null> {
  const horses = await listHorses(race_id);
  return horses.find(h => h.user_id === user_id) ?? null;
}

export async function rotateHeartbeatToken(
  race_id: string,
  horse_id: string,
  new_token: string,
): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    UpdateExpression: 'SET heartbeat_token = :t',
    ExpressionAttributeValues: { ':t': new_token },
    ConditionExpression: 'attribute_exists(pk)',
  }));
}

export async function countHorses(race_id: string): Promise<number> {
  const { Count = 0 } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :hp)',
    ExpressionAttributeValues: {
      ':pk': `${RACE_PK_PREFIX}${race_id}`,
      ':hp': HORSE_SK_PREFIX,
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
