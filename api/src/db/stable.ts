import { GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import {
  stableHorseKey,
  stableHorseNameKey,
  USER_PK_PREFIX,
  STABLE_HORSE_SK_PREFIX,
} from './keys.js';
import type { CollectedHat, StableHorse } from '@token-derby/shared';
import { adjustEquippedAfterRemoval } from '../lib/hat-removal.js';

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

/**
 * Atomically add XP to a stable horse. If the horse has been deleted, the
 * conditional check fails and the call is a no-op (XP is forfeit).
 */
export async function awardHorseXp(
  user_id: string,
  stable_horse_id: string,
  delta: number,
): Promise<void> {
  if (delta <= 0) return;
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: stableHorseKey(user_id, stable_horse_id),
      UpdateExpression: 'ADD xp :d',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':d': delta },
    }));
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return;
    throw e;
  }
}

/**
 * Atomically increment lifetime race stats. Called once per (horse, race)
 * at finalisation, gated by the per-race xp_awarded marker. If the horse
 * has been deleted, the conditional check fails and the call is a no-op.
 */
export async function recordHorseRaceResult(
  user_id: string,
  stable_horse_id: string,
  result: { final_tokens: number; rank: number },
): Promise<void> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: stableHorseKey(user_id, stable_horse_id),
      UpdateExpression:
        'ADD races_entered :one, wins :w, podiums :p, ' +
        'total_tokens :t, total_finishing_position :r',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: {
        ':one': 1,
        ':w': result.rank === 1 ? 1 : 0,
        ':p': result.rank <= 3 ? 1 : 0,
        ':t': Math.max(0, result.final_tokens),
        ':r': result.rank,
      },
    }));
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return;
    throw e;
  }
}

export type ApplyRollInput = {
  /** What we expect last_rolled_level to be at the moment of write. */
  expected_last_rolled_level: number;
  /** When set, this CollectedHat gets appended to hats[]. Omit for no_hat / duplicate. */
  append_hat?: CollectedHat;
  /** Atomic XP delta (for no_hat or duplicate outcomes that pay consolation XP). */
  xp_delta?: number;
};

/**
 * Atomic update that:
 *  - bumps last_rolled_level by 1, conditional on its current value matching
 *    expected_last_rolled_level (or being absent if expected is 0)
 *  - optionally appends a CollectedHat to hats[]
 *  - optionally adds xp_delta to xp
 *
 * Throws if the conditional check fails (caller should treat as a retry signal).
 */
export async function applyRollResult(
  user_id: string,
  stable_horse_id: string,
  input: ApplyRollInput,
): Promise<void> {
  const sets: string[] = ['last_rolled_level = :new_lvl'];
  const adds: string[] = [];
  const eav: Record<string, unknown> = {
    ':new_lvl': input.expected_last_rolled_level + 1,
    ':expected_lvl': input.expected_last_rolled_level,
  };
  // Allow the write when:
  //   • The attribute is absent AND expected is 0 (normal first roll at level 1), OR
  //   • The attribute is absent AND expected > 0 (lazy-migration first roll for a levelled horse), OR
  //   • The stored value equals expected (subsequent rolls, optimistic lock).
  const conditionExpr =
    'attribute_not_exists(last_rolled_level) OR last_rolled_level = :expected_lvl';

  if (input.append_hat) {
    sets.push('hats = list_append(if_not_exists(hats, :empty), :new_hat)');
    eav[':empty'] = [];
    eav[':new_hat'] = [input.append_hat];
  }
  if (input.xp_delta && input.xp_delta > 0) {
    adds.push('xp :xp_delta');
    eav[':xp_delta'] = input.xp_delta;
  }

  const updateExpression =
    'SET ' + sets.join(', ') +
    (adds.length ? ' ADD ' + adds.join(', ') : '');

  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: stableHorseKey(user_id, stable_horse_id),
    UpdateExpression: updateExpression,
    ConditionExpression: 'attribute_exists(pk) AND (' + conditionExpr + ')',
    ExpressionAttributeValues: eav,
  }));
}

/**
 * Append a hat without touching last_rolled_level — a claim must not consume a
 * pending roll. Returns the index the hat landed at, or null if the horse is gone.
 */
export async function appendStableHorseHat(
  user_id: string,
  stable_horse_id: string,
  hat: CollectedHat,
): Promise<number | null> {
  try {
    const { Attributes } = await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: stableHorseKey(user_id, stable_horse_id),
      UpdateExpression: 'SET hats = list_append(if_not_exists(hats, :empty), :new_hat)',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':empty': [], ':new_hat': [hat] },
      ReturnValues: 'UPDATED_NEW',
    }));
    const hats = (Attributes?.hats ?? []) as CollectedHat[];
    return hats.length - 1;
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return null;
    throw e;
  }
}

/**
 * Set or clear the equipped_hat index on a stable horse.
 * Passing null clears the attribute entirely (reads back as undefined).
 */
export async function equipHat(
  user_id: string,
  stable_horse_id: string,
  hat_index: number | null,
): Promise<void> {
  if (hat_index === null) {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: stableHorseKey(user_id, stable_horse_id),
      UpdateExpression: 'REMOVE equipped_hat',
      ConditionExpression: 'attribute_exists(pk)',
    }));
    return;
  }
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: stableHorseKey(user_id, stable_horse_id),
    UpdateExpression: 'SET equipped_hat = :idx',
    ConditionExpression: 'attribute_exists(pk)',
    ExpressionAttributeValues: { ':idx': hat_index },
  }));
}

/**
 * Remove the hat at `index` from a stable horse's hats[], fixing up the
 * equipped_hat index. Caller is responsible for range-checking `index`.
 */
export async function removeStableHorseHat(
  user_id: string,
  stable_horse_id: string,
  index: number,
): Promise<StableHorse> {
  const existing = await getStableHorse(user_id, stable_horse_id);
  if (!existing) throw new Error('stable horse not found');

  const hats = [...(existing.hats ?? [])];
  hats.splice(index, 1);
  const nextEquipped = adjustEquippedAfterRemoval(existing.equipped_hat, index);

  if (nextEquipped === null) {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: stableHorseKey(user_id, stable_horse_id),
      UpdateExpression: 'SET hats = :h REMOVE equipped_hat',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':h': hats },
    }));
  } else {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: stableHorseKey(user_id, stable_horse_id),
      UpdateExpression: 'SET hats = :h, equipped_hat = :e',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':h': hats, ':e': nextEquipped },
    }));
  }

  return {
    ...existing,
    hats,
    equipped_hat: nextEquipped === null ? undefined : nextEquipped,
  };
}
