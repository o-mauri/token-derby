import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import {
  stableHorseKey,
  stableHorseNameKey,
  USER_PK_PREFIX,
  STABLE_HORSE_SK_PREFIX,
} from './keys.js';
import type { StableHorse } from '@token-derby/shared';

/**
 * Create a stable horse, atomically reserving the name within the user's
 * stable via a sentinel item. Throws ConditionalCheckFailedException-flavored
 * errors on name collision.
 */
export async function putStableHorse(user_id: string, horse: StableHorse): Promise<void> {
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE,
          Item: { ...stableHorseKey(user_id, horse.stable_horse_id), ...horse },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
      {
        Put: {
          TableName: TABLE,
          Item: {
            ...stableHorseNameKey(user_id, horse.name),
            stable_horse_id: horse.stable_horse_id,
          },
          ConditionExpression: 'attribute_not_exists(pk)',
        },
      },
    ],
  }));
}

export async function getStableHorse(user_id: string, stable_horse_id: string): Promise<StableHorse | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: stableHorseKey(user_id, stable_horse_id),
  }));
  if (!Item) return null;
  const { pk: _pk, sk: _sk, ...rest } = Item;
  return rest as StableHorse;
}

export async function listStableHorses(user_id: string): Promise<StableHorse[]> {
  const { Items = [] } = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
    ExpressionAttributeValues: {
      ':pk': `${USER_PK_PREFIX}${user_id}`,
      ':sk': STABLE_HORSE_SK_PREFIX,
    },
  }));
  return Items.map(it => {
    const { pk: _pk, sk: _sk, ...rest } = it;
    return rest as StableHorse;
  });
}

/**
 * Update a stable horse. If `name` is provided and different, atomically
 * swaps the name-sentinel item (release old, claim new) in the same
 * transaction as the horse update.
 */
export async function updateStableHorse(
  user_id: string,
  existing: StableHorse,
  patch: { name?: string; colors?: StableHorse['colors'] },
): Promise<StableHorse> {
  const next: StableHorse = {
    ...existing,
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.colors !== undefined ? { colors: patch.colors } : {}),
  };

  const nameChanging = patch.name !== undefined && patch.name !== existing.name;

  if (nameChanging) {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: { ...stableHorseKey(user_id, existing.stable_horse_id), ...next },
            ConditionExpression: 'attribute_exists(pk)',
          },
        },
        {
          Delete: {
            TableName: TABLE,
            Key: stableHorseNameKey(user_id, existing.name),
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: {
              ...stableHorseNameKey(user_id, next.name),
              stable_horse_id: existing.stable_horse_id,
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ],
    }));
  } else {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE,
            Item: { ...stableHorseKey(user_id, existing.stable_horse_id), ...next },
            ConditionExpression: 'attribute_exists(pk)',
          },
        },
      ],
    }));
  }
  return next;
}

export async function deleteStableHorse(user_id: string, horse: StableHorse): Promise<void> {
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Delete: {
          TableName: TABLE,
          Key: stableHorseKey(user_id, horse.stable_horse_id),
        },
      },
      {
        Delete: {
          TableName: TABLE,
          Key: stableHorseNameKey(user_id, horse.name),
        },
      },
    ],
  }));
}
