import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { rateLimitKey } from './keys.js';

export const WINDOW_SECONDS = 3600;

/** Failed claim lookups allowed per user per window. */
export const CLAIM_LOOKUP_LIMIT = 10;

/**
 * Fixed-window counter. One atomic ADD that returns the new value, so there is
 * no read-then-write race and no lock. Returns the count including this attempt.
 */
export async function recordAttempt(
  bucket: string,
  subject: string,
  nowMs: number = Date.now(),
): Promise<number> {
  const windowStart = Math.floor(nowMs / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
  const { Attributes } = await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: rateLimitKey(bucket, subject, windowStart),
    UpdateExpression: 'ADD attempts :one SET #ttl = :ttl',
    ExpressionAttributeNames: { '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':one': 1,
      ':ttl': windowStart + WINDOW_SECONDS * 2,
    },
    ReturnValues: 'UPDATED_NEW',
  }));
  return Number(Attributes?.attempts ?? 0);
}
