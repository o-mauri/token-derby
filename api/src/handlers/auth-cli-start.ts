import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { ApiHandler } from '../lib/http.js';
import type { CliAuthStartRequest, CliAuthStartResponse } from '@token-derby/shared';
import {
  CLI_AUTH_TTL_SECONDS,
  CLI_AUTH_POLL_INTERVAL_SECONDS,
  validateDeviceLabel,
} from '@token-derby/shared';
import { ok, err, parseJson } from '../lib/http.js';
import { originOf } from '../lib/oauth.js';
import { generateJoinCode, generateSecretToken } from '../lib/codes.js';
import { putCliAuthRequest, UserCodeCollisionError } from '../db/cli-auth-requests.js';
import { recordAttempt, CLI_START_BUCKET, CLI_START_LIMIT } from '../db/rate-limits.js';
import { authenticate } from '../lib/auth.js';

// user_code is 6 chars over a 32-char alphabet (~1e9 space); this many
// collisions in a row is not a real-world case, only a stuck loop guard.
const MAX_USER_CODE_ATTEMPTS = 10;

/**
 * Rate-limit subject. A signed-in relink is charged to the identity; an
 * anonymous start has only the connection, which API Gateway v2 reports as
 * requestContext.http.sourceIp (never a client-supplied header — those are
 * forgeable and would make the limit free to evade). Prefixed so a user id can
 * never share a bucket row with an address, and falling back to a single shared
 * subject when the field is absent, which fails closed rather than unlimited.
 */
function rateLimitSubject(event: APIGatewayProxyEventV2, user_id: string | undefined): string {
  if (user_id) return `user:${user_id}`;
  const ip = event.requestContext?.http?.sourceIp;
  return `ip:${ip && ip.length > 0 ? ip : 'unknown'}`;
}

export const handler: ApiHandler = async (event) => {
  const body = parseJson<CliAuthStartRequest>(event.body);
  const validated = validateDeviceLabel(body?.label);
  if (!validated.ok) return err('BAD_REQUEST', validated.message);
  const label = validated.label;

  // Unauthenticated endpoint: a machine with no identity.json is the primary
  // case. But if valid CLI credentials ARE attached, this is a relink rather
  // than a fresh account, and the caller becomes the link target — the same
  // mechanism auth-link-start.ts uses on the web. An invalid/stale credential
  // must not fail the request; it just falls back to the create branch.
  const caller = await authenticate(event);
  const link_to_user_id = 'user_id' in caller ? caller.user_id : undefined;

  // Charged after the label checks and before anything is written: a rejected
  // label creates no code, so it must not spend the budget an honest retry
  // needs, and an over-budget caller must not get a row.
  const attempts = await recordAttempt(CLI_START_BUCKET, rateLimitSubject(event, link_to_user_id));
  if (attempts > CLI_START_LIMIT) {
    return err('RATE_LIMITED', 'Too many sign-in attempts. Try again later.');
  }

  const device_code = generateSecretToken();

  for (let attempt = 0; ; attempt++) {
    const user_code = generateJoinCode();
    try {
      await putCliAuthRequest({
        device_code,
        user_code,
        label,
        ...(link_to_user_id ? { link_to_user_id } : {}),
        ttlSeconds: CLI_AUTH_TTL_SECONDS,
      });
      const response: CliAuthStartResponse = {
        device_code,
        user_code,
        // SITE_ORIGIN, never the Host header: CloudFront rewrites Host to the
        // API's own execute-api domain on both /api/* behaviours, so a
        // Host-derived URL would send the human to a hostname that does not
        // serve the site (Phase 1 finding C1).
        verification_uri: `${originOf(event)}/cli`,
        interval: CLI_AUTH_POLL_INTERVAL_SECONDS,
        expires_in: CLI_AUTH_TTL_SECONDS,
      };
      return ok(response);
    } catch (e) {
      if (e instanceof UserCodeCollisionError && attempt < MAX_USER_CODE_ATTEMPTS - 1) continue;
      throw e;
    }
  }
};
