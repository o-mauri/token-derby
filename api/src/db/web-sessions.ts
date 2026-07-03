import { PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { webGrantKey, webSessionKey } from './keys.js';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export async function putWebGrant(
  code: string,
  user_id: string,
  display_name: string,
  ttlSeconds: number,
): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...webGrantKey(code),
      user_id,
      display_name,
      created_at: new Date().toISOString(),
      ttl: nowSeconds() + ttlSeconds,
    },
  }));
}

/** Single-use: reads then deletes. Returns null if missing or expired. */
export async function consumeWebGrant(
  code: string,
): Promise<{ user_id: string; display_name: string } | null> {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: webGrantKey(code) }));
  if (!Item) return null;
  // Conditional delete guarantees single use even under a race: only the caller
  // that actually removes the row may proceed.
  try {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: webGrantKey(code),
      ConditionExpression: 'attribute_exists(pk)',
    }));
  } catch {
    return null;
  }
  if (typeof Item.ttl === 'number' && Item.ttl <= nowSeconds()) return null;
  return { user_id: String(Item.user_id), display_name: String(Item.display_name) };
}

export async function putWebSession(
  token: string,
  user_id: string,
  display_name: string,
  expires_at: string,
  ttlSeconds: number,
): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...webSessionKey(token),
      user_id,
      display_name,
      created_at: new Date().toISOString(),
      expires_at,
      ttl: nowSeconds() + ttlSeconds,
    },
  }));
}

/** Returns null if missing or past expires_at (TTL deletion may lag). */
export async function getWebSession(
  token: string,
): Promise<{ user_id: string; display_name: string; expires_at: string } | null> {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: webSessionKey(token) }));
  if (!Item) return null;
  const expires_at = String(Item.expires_at);
  if (Date.parse(expires_at) <= Date.now()) return null;
  return { user_id: String(Item.user_id), display_name: String(Item.display_name), expires_at };
}

export async function deleteWebSession(token: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLE, Key: webSessionKey(token) }));
}
