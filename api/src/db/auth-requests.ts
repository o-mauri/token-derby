import { PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { authRequestKey } from './keys.js';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export type PendingAuthRequest = {
  code_verifier: string;
  nonce: string;
  redirect_uri: string;
  link_to_user_id?: string;
};

export async function putAuthRequest(req: PendingAuthRequest & {
  state: string;
  ttlSeconds: number;
}): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...authRequestKey(req.state),
      code_verifier: req.code_verifier,
      nonce: req.nonce,
      redirect_uri: req.redirect_uri,
      ...(req.link_to_user_id ? { link_to_user_id: req.link_to_user_id } : {}),
      created_at: new Date().toISOString(),
      ttl: nowSeconds() + req.ttlSeconds,
    },
  }));
}

/** Single-use: reads then conditionally deletes. Null if missing or expired. */
export async function consumeAuthRequest(state: string): Promise<PendingAuthRequest | null> {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: authRequestKey(state) }));
  if (!Item) return null;
  // Only the caller that actually removes the row may proceed, so a replayed
  // callback cannot reuse the same authorisation code.
  try {
    await ddb.send(new DeleteCommand({
      TableName: TABLE,
      Key: authRequestKey(state),
      ConditionExpression: 'attribute_exists(pk)',
    }));
  } catch {
    return null;
  }
  if (typeof Item.ttl === 'number' && Item.ttl <= nowSeconds()) return null;
  return {
    code_verifier: String(Item.code_verifier),
    nonce: String(Item.nonce),
    redirect_uri: String(Item.redirect_uri),
    ...(Item.link_to_user_id ? { link_to_user_id: String(Item.link_to_user_id) } : {}),
  };
}
