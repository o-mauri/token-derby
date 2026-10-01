import type { ApiHandler } from '../lib/http.js';
import type { CliAuthPollRequest, CliAuthPollResponse } from '@token-derby/shared';
import { DEVICE_CODE_LENGTH } from '@token-derby/shared';
import { ok, err, parseJson } from '../lib/http.js';
import { consumeCliAuthRequest } from '../db/cli-auth-requests.js';
import { recordAttempt, CLI_POLL_BUCKET, CLI_POLL_LIMIT } from '../db/rate-limits.js';
import { getUserById } from '../db/users.js';
import { listStableHorses } from '../db/stable.js';
import { listOrganisationsForUser } from '../db/organisations.js';

const PENDING: CliAuthPollResponse = { status: 'pending' };

/**
 * Unauthenticated by design — device_code is itself the bearer secret the CLI
 * received from /start. Unknown and still-pending answer with the exact same
 * `{ status: 'pending' }`: reading them differently would tell a caller
 * something about a device_code it does not already hold, which is the
 * oracle this endpoint must not become.
 *
 * Over-limit is NOT folded into that: device_code is 256 bits and unguessable,
 * so polling one at all already proves possession of it — a 429 here leaks
 * nothing an attacker didn't already know, and it is the only way a
 * misbehaving or buggy client finds out it is being throttled instead of
 * spinning silently to the 600s expiry.
 */
export const handler: ApiHandler = async (event) => {
  const body = parseJson<CliAuthPollRequest>(event.body);
  // Exact length, not just non-empty: this value becomes a DynamoDB partition
  // key on the very next line, and that key rejects anything over 2048 bytes —
  // an unhandled throw on a public endpoint. Every issued device_code is
  // exactly this long, so nothing legitimate is turned away.
  if (!body || typeof body.device_code !== 'string' || body.device_code.length !== DEVICE_CODE_LENGTH) {
    return err('BAD_REQUEST', 'device_code is required');
  }

  // Charged before the lookup: charging only failures would leave a
  // just-over-budget poll served on a correct code, defeating the limit.
  const attempts = await recordAttempt(CLI_POLL_BUCKET, body.device_code);
  if (attempts > CLI_POLL_LIMIT) {
    return err('RATE_LIMITED', 'Too many poll attempts. Try again later.');
  }

  // Single-use: deletes both rows on success, so a replayed poll cannot
  // re-collect the same credential.
  const consumed = await consumeCliAuthRequest(body.device_code);
  if (!consumed || !consumed.user_id) {
    return ok(PENDING);
  }

  const [user, horses, orgs] = await Promise.all([
    getUserById(consumed.user_id),
    listStableHorses(consumed.user_id),
    listOrganisationsForUser(consumed.user_id),
  ]);

  const response: CliAuthPollResponse = {
    status: 'approved',
    user_id: consumed.user_id,
    secret_token: consumed.issued_token,
    device_id: consumed.device_id,
    display_name: user?.display_name ?? '',
    ...(user?.email ? { email: user.email } : {}),
    horses: horses.length,
    orgs: orgs.length,
  };
  return ok(response);
};
