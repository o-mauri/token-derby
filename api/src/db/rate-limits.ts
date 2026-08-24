import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from './client.js';
import { rateLimitKey } from './keys.js';

export const WINDOW_SECONDS = 3600;

/** Failed claim lookups allowed per user per window. */
export const CLAIM_LOOKUP_LIMIT = 10;

export const CLI_APPROVE_BUCKET = 'cli-approve';

/**
 * Device-code approve attempts allowed per signed-in user per window. Every
 * candidate code costs one, previews included, so a single registration spends
 * two. A person needs a handful even with mistypes; a prober needs thousands,
 * so this is the throttle RFC 8628 assumes is guarding a 6-character user_code.
 */
export const CLI_APPROVE_LIMIT = 40;

export const CLI_START_BUCKET = 'cli-start';

/**
 * Device-flow starts allowed per window, per signed-in user when credentials are
 * attached and per source IP otherwise. Not a cost control: every start mints a
 * live unlinked user_code, and the RFC 8628 residual phishing case was accepted
 * on the premise that an attacker must get a specific victim to type a specific
 * code. Unbounded starts break that premise — a large enough pool of live codes
 * makes somebody else's mistype land on an attacker's flow. Sized in the test
 * beside the honest worst case it has to clear.
 */
export const CLI_START_LIMIT = 200;

export const DEVICE_REGISTER_BUCKET = 'device-register';

/**
 * Direct device registrations allowed per signed-in user per window. Not a
 * defence against an attacker — the caller already holds a working credential,
 * so it grants them nothing they could not already do. It stops a loop (a
 * scripted `link`, a retry wrapper) from filling the table with device rows the
 * person then has to revoke one at a time in the Account view. Sized in the
 * test beside the honest count it has to clear.
 */
export const DEVICE_REGISTER_LIMIT = 20;

export const CLI_POLL_BUCKET = 'cli-poll';

/**
 * Poll attempts allowed per device_code per window. device_code is the
 * secret itself (32 random bytes), not something a caller can enumerate, so
 * this isn't a brute-force throttle the way CLI_APPROVE_LIMIT is — it bounds
 * what one flow can cost the table. A well-behaved CLI polls every
 * CLI_AUTH_POLL_INTERVAL_SECONDS (5) for up to CLI_AUTH_TTL_SECONDS (600),
 * i.e. ceil(600 / 5) = 120 polls for the whole life of one login — this
 * clears that with double the room for clock jitter and retries. Each fresh
 * `/start` call mints its own device_code, so restarting an abandoned login
 * within the same hour spends a brand new budget, not this one.
 */
export const CLI_POLL_LIMIT = 240;

/**
 * Fixed-window counter. One atomic ADD that returns the new value, so there is
 * no read-then-write race and no lock. Returns the count including this attempt.
 *
 * `count` exists so a test can put the counter at a limit in one write instead of
 * a few hundred. Production always charges one; the limits here run to 400, and
 * serialising that many round-trips per case was slow enough to time out.
 */
export async function recordAttempt(
  bucket: string,
  subject: string,
  nowMs: number = Date.now(),
  count = 1,
): Promise<number> {
  const windowStart = Math.floor(nowMs / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
  const { Attributes } = await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: rateLimitKey(bucket, subject, windowStart),
    UpdateExpression: 'ADD attempts :one SET #ttl = :ttl',
    ExpressionAttributeNames: { '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':one': count,
      ':ttl': windowStart + WINDOW_SECONDS * 2,
    },
    ReturnValues: 'UPDATED_NEW',
  }));
  return Number(Attributes?.attempts ?? 0);
}
