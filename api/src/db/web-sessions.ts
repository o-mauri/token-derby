import { PutCommand, GetCommand, DeleteCommand, UpdateCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { webGrantKey, webSessionKey, userWebSessionKey, userMetaKey, USER_WEB_SESSION_SK_PREFIX } from './keys.js';

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
  const ttl = nowSeconds() + ttlSeconds;
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      { Put: { TableName: TABLE, Item: { ...webSessionKey(token), user_id, display_name, created_at: new Date().toISOString(), expires_at, ttl } } },
      { Put: { TableName: TABLE, Item: { ...userWebSessionKey(user_id, token), ttl } } },
    ],
  }));
}

/** Tokens of the user's web sessions, from their markers (expired ones may linger until TTL). */
async function userWebSessionTokens(user_id: string): Promise<string[]> {
  const tokens: string[] = [];
  let start: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :sk)',
      ExpressionAttributeValues: { ':pk': userMetaKey(user_id).pk, ':sk': USER_WEB_SESSION_SK_PREFIX },
      ProjectionExpression: 'sk',
      ExclusiveStartKey: start,
    }));
    for (const item of res.Items ?? []) tokens.push(String(item.sk).slice(USER_WEB_SESSION_SK_PREFIX.length));
    start = res.LastEvaluatedKey;
  } while (start);
  return tokens;
}

/** Ends every web session of the user; returns how many were still signed in. */
export async function deleteUserWebSessions(user_id: string): Promise<number> {
  const tokens = await userWebSessionTokens(user_id);
  const ended = await Promise.all(tokens.map(async (token) => {
    const { Attributes } = await ddb.send(new DeleteCommand({ TableName: TABLE, Key: webSessionKey(token), ReturnValues: 'ALL_OLD' }));
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: userWebSessionKey(user_id, token) }));
    return Attributes && Date.parse(String(Attributes.expires_at)) > Date.now() ? 1 : 0;
  }));
  return ended.reduce<number>((n, x) => n + x, 0);
}

/** Keeps every live session's name in step with a rename. */
export async function setUserWebSessionsDisplayName(user_id: string, display_name: string): Promise<void> {
  const tokens = await userWebSessionTokens(user_id);
  await Promise.all(tokens.map((token) => setWebSessionDisplayName(token, display_name)));
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
  const { Attributes } = await ddb.send(new DeleteCommand({ TableName: TABLE, Key: webSessionKey(token), ReturnValues: 'ALL_OLD' }));
  if (Attributes?.user_id) await ddb.send(new DeleteCommand({ TableName: TABLE, Key: userWebSessionKey(String(Attributes.user_id), token) }));
}

/** Keeps a live session's name in step with a rename; a missing (expired) session is left alone. */
export async function setWebSessionDisplayName(token: string, display_name: string): Promise<void> {
  try {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: webSessionKey(token),
      UpdateExpression: 'SET display_name = :n',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':n': display_name },
    }));
  } catch (e) {
    if ((e as { name?: string }).name !== 'ConditionalCheckFailedException') throw e;
  }
}
