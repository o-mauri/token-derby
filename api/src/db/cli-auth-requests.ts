import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { cliAuthRequestKey, cliAuthCodeKey } from './keys.js';

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export type CliAuthRequestStatus = 'pending' | 'approved';

export type CliAuthRequest = {
  device_code: string;
  user_code: string;
  label: string;
  status: CliAuthRequestStatus;
  link_to_user_id?: string;
  issued_token?: string;
  user_id?: string;
  device_id?: string;
};

/** Returned once, by consumeCliAuthRequest: an approved request with its credential and device. */
export type ConsumedCliAuthRequest = CliAuthRequest & { issued_token: string; device_id: string };

/** Raised on a user_code collision so the caller (Task 4's /start) can regenerate. */
export class UserCodeCollisionError extends Error {
  constructor(user_code: string) {
    super(`user_code ${user_code} is already in use`);
    this.name = 'UserCodeCollisionError';
  }
}

export async function putCliAuthRequest(input: {
  device_code: string;
  user_code: string;
  label: string;
  link_to_user_id?: string;
  ttlSeconds: number;
}): Promise<void> {
  const ttl = nowSeconds() + input.ttlSeconds;
  const now = new Date().toISOString();
  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        {
          // Pointer row first: attribute_not_exists(pk) is the only thing
          // standing between two concurrent /start calls and one user_code
          // resolving to two different device_codes.
          Put: {
            TableName: TABLE,
            Item: { ...cliAuthCodeKey(input.user_code), device_code: input.device_code, created_at: now, ttl },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        {
          Put: {
            TableName: TABLE,
            Item: {
              ...cliAuthRequestKey(input.device_code),
              user_code: input.user_code,
              label: input.label,
              ...(input.link_to_user_id ? { link_to_user_id: input.link_to_user_id } : {}),
              status: 'pending' as const,
              created_at: now,
              ttl,
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ],
    }));
  } catch (err: any) {
    if (err?.name === 'TransactionCanceledException') {
      // TransactItems order above: [0] pointer row Put, [1] record row Put.
      // CancellationReasons is positional, so this tells a user_code
      // collision (near-impossible for device_code) apart from anything else.
      const reasons = err.CancellationReasons ?? [];
      if (reasons[0]?.Code === 'ConditionalCheckFailed') throw new UserCodeCollisionError(input.user_code);
      throw err;
    }
    throw err;
  }
}

function toCliAuthRequest(device_code: string, item: Record<string, unknown>): CliAuthRequest {
  return {
    device_code,
    user_code: String(item.user_code),
    label: String(item.label),
    status: item.status === 'approved' ? 'approved' : 'pending',
    ...(item.link_to_user_id ? { link_to_user_id: String(item.link_to_user_id) } : {}),
    ...(item.issued_token ? { issued_token: String(item.issued_token) } : {}),
    ...(item.user_id ? { user_id: String(item.user_id) } : {}),
    ...(item.device_id ? { device_id: String(item.device_id) } : {}),
  };
}

/** DynamoDB's TTL deletion is lazy, so a row past its ttl must still read as absent here. */
function isLive(item: Record<string, unknown> | undefined): item is Record<string, unknown> {
  if (!item) return false;
  return !(typeof item.ttl === 'number' && item.ttl <= nowSeconds());
}

export async function getCliAuthRequest(device_code: string): Promise<CliAuthRequest | null> {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: cliAuthRequestKey(device_code) }));
  if (!isLive(Item)) return null;
  return toCliAuthRequest(device_code, Item);
}

export async function getCliAuthRequestByUserCode(user_code: string): Promise<CliAuthRequest | null> {
  const { Item: pointer } = await ddb.send(new GetCommand({ TableName: TABLE, Key: cliAuthCodeKey(user_code) }));
  if (!isLive(pointer)) return null;
  return getCliAuthRequest(String(pointer.device_code));
}

/** Raised when approving a device_code that doesn't exist, has expired, or was already approved. */
export class CliAuthRequestNotPendingError extends Error {
  constructor(device_code: string) {
    super(`cli auth request ${device_code} is not a pending request`);
    this.name = 'CliAuthRequestNotPendingError';
  }
}

export async function approveCliAuthRequest(input: {
  device_code: string;
  issued_token: string;
  user_id: string;
  device_id: string;
}): Promise<void> {
  // Read-then-write rather than a blind conditional UpdateCommand so the ttl
  // check is explicit here too, not left to DynamoDB's lazy TTL sweep.
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: cliAuthRequestKey(input.device_code) }));
  if (!isLive(Item) || Item.status !== 'pending') throw new CliAuthRequestNotPendingError(input.device_code);

  try {
    await ddb.send(new TransactWriteCommand({
      TransactItems: [{
        Update: {
          TableName: TABLE,
          Key: cliAuthRequestKey(input.device_code),
          UpdateExpression: 'SET #status = :approved, issued_token = :token, user_id = :uid, device_id = :did',
          // link_to_user_id is in the condition, not just checked by the caller:
          // it makes the "only the linked jockey may be approved onto" rule
          // atomic, so a row that gains a link between a caller's read and this
          // write cannot be approved onto somebody else.
          ConditionExpression:
            'attribute_exists(pk) AND #status = :pending'
            + ' AND (attribute_not_exists(link_to_user_id) OR link_to_user_id = :uid)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: {
            ':approved': 'approved', ':token': input.issued_token, ':uid': input.user_id,
            ':did': input.device_id, ':pending': 'pending',
          },
        },
      }],
    }));
  } catch (err: any) {
    if (err?.name === 'TransactionCanceledException') throw new CliAuthRequestNotPendingError(input.device_code);
    throw err;
  }
}

/**
 * Single-use: reads the approved record then conditionally deletes both rows,
 * so a replayed poll cannot re-collect the same credential. Null if missing,
 * expired, or not yet approved.
 */
export async function consumeCliAuthRequest(device_code: string): Promise<ConsumedCliAuthRequest | null> {
  const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: cliAuthRequestKey(device_code) }));
  if (!isLive(Item)) return null;
  if (
    Item.status !== 'approved'
    || typeof Item.issued_token !== 'string'
    || typeof Item.device_id !== 'string'
  ) return null;

  const user_code = String(Item.user_code);
  try {
    // Only the caller that actually removes both rows may return the
    // credential, so two concurrent polls cannot both collect it.
    await ddb.send(new TransactWriteCommand({
      TransactItems: [
        { Delete: { TableName: TABLE, Key: cliAuthRequestKey(device_code), ConditionExpression: 'attribute_exists(pk)' } },
        { Delete: { TableName: TABLE, Key: cliAuthCodeKey(user_code), ConditionExpression: 'attribute_exists(pk)' } },
      ],
    }));
  } catch (err: any) {
    if (err?.name === 'TransactionCanceledException') return null;
    throw err;
  }

  return toCliAuthRequest(device_code, Item) as ConsumedCliAuthRequest;
}
