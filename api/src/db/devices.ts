import { randomUUID } from 'node:crypto';
import { PutCommand, GetCommand, QueryCommand, DeleteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { deviceKey, USER_PK_PREFIX, DEVICE_SK_PREFIX } from './keys.js';
import { hashSecretToken } from '../lib/token-hash.js';

export type DeviceRecord = {
  device_id: string;
  label: string;
  created_at: string;
  last_seen_at: string;
};

export async function putDevice(input: {
  user_id: string;
  token: string;
  label: string;
}): Promise<DeviceRecord> {
  const now = new Date().toISOString();
  const record: DeviceRecord = {
    device_id: randomUUID(),
    label: input.label,
    created_at: now,
    last_seen_at: now,
  };
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { ...deviceKey(input.user_id, hashSecretToken(input.token)), ...record },
  }));
  return record;
}

export async function getDeviceByToken(user_id: string, token: string): Promise<DeviceRecord | null> {
  const { Item } = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: deviceKey(user_id, hashSecretToken(token)),
  }));
  if (!Item) return null;
  const { pk: _pk, sk: _sk, ...rest } = Item;
  return rest as DeviceRecord;
}

/** Raw rows (including pk/sk) for the user's devices — used internally so deleteDevice can find the sk for a given device_id without re-deriving a token hash. */
async function queryDeviceRows(user_id: string): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: {
        ':pk': `${USER_PK_PREFIX}${user_id}`,
        ':sk': DEVICE_SK_PREFIX,
      },
      ExclusiveStartKey,
    }));
    for (const item of res.Items ?? []) out.push(item);
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return out;
}

/**
 * Newest first. The sort key is a token hash (no chronological meaning), so
 * ordering is done here on created_at, with device_id as a tiebreaker for
 * devices created in the same millisecond.
 */
export async function listDevices(user_id: string): Promise<DeviceRecord[]> {
  const rows = await queryDeviceRows(user_id);
  return rows
    .map((it) => {
      const { pk: _pk, sk: _sk, ...rest } = it;
      return rest as DeviceRecord;
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.device_id.localeCompare(a.device_id));
}

export async function deleteDevice(user_id: string, device_id: string): Promise<boolean> {
  const rows = await queryDeviceRows(user_id);
  const match = rows.find((it) => it.device_id === device_id);
  if (!match) return false;
  try {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: { pk: match.pk, sk: match.sk },
      ConditionExpression: 'attribute_exists(pk)',
    }));
    return true;
  } catch (e: any) {
    // Lost a race with a concurrent delete of the same row.
    if (e?.name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}

/**
 * Deletes the device row keyed by the exact token presented, e.g. by a CLI
 * logging out with its own credential. Unlike deleteDevice (by device_id),
 * this needs no query — the token hash already IS the sort key — so a legacy,
 * account-level credential (no device row) resolves to `false` in one read
 * rather than a query over every device the user has.
 */
export async function deleteDeviceByToken(user_id: string, token: string): Promise<boolean> {
  try {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: deviceKey(user_id, hashSecretToken(token)),
      ConditionExpression: 'attribute_exists(pk)',
    }));
    return true;
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}

export async function touchDevice(user_id: string, token: string): Promise<void> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: deviceKey(user_id, hashSecretToken(token)),
      UpdateExpression: 'SET last_seen_at = :now',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':now': new Date().toISOString() },
    }));
  } catch (e: any) {
    // Device was revoked between authenticate() finding it and touchDevice being called; no-op.
    if (e?.name === 'ConditionalCheckFailedException') return;
    throw e;
  }
}
