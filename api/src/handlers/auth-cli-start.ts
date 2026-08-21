import type { ApiHandler } from '../lib/http.js';
import type { CliAuthStartRequest, CliAuthStartResponse } from '@token-derby/shared';
import { DEVICE_LABEL_MAX_LENGTH, CLI_AUTH_TTL_SECONDS, CLI_AUTH_POLL_INTERVAL_SECONDS } from '@token-derby/shared';
import { ok, err, parseJson } from '../lib/http.js';
import { originOf } from '../lib/oauth.js';
import { generateJoinCode, generateSecretToken } from '../lib/codes.js';
import { putCliAuthRequest, UserCodeCollisionError } from '../db/cli-auth-requests.js';
import { authenticate } from '../lib/auth.js';

// user_code is 6 chars over a 32-char alphabet (~1e9 space); this many
// collisions in a row is not a real-world case, only a stuck loop guard.
const MAX_USER_CODE_ATTEMPTS = 10;

// C0/C1 controls (\p{Cc}) and Unicode format characters (\p{Cf} — zero-width
// characters, bidi overrides like U+202E). The label is shown verbatim on the
// /cli approval page as the human's "second thing to compare against their
// terminal"; either category lets a device rewrite how its own name reads
// without visibly matching what the person typed, or make two different
// labels render identically. Rejected at intake, not stripped or escaped at
// render, so a device sees its name was refused rather than silently
// getting a different one back. Deliberately narrow: accented letters, CJK,
// Cyrillic and a curly apostrophe are all outside these two categories and
// stay allowed.
const UNSAFE_LABEL_CHARS = /[\p{Cc}\p{Cf}]/u;

export const handler: ApiHandler = async (event) => {
  const body = parseJson<CliAuthStartRequest>(event.body);
  if (!body || typeof body.label !== 'string') {
    return err('BAD_REQUEST', 'label is required');
  }
  const label = body.label.trim();
  if (label.length < 1 || label.length > DEVICE_LABEL_MAX_LENGTH) {
    return err('BAD_REQUEST', `label must be 1–${DEVICE_LABEL_MAX_LENGTH} characters`);
  }
  if (UNSAFE_LABEL_CHARS.test(label)) {
    return err('BAD_REQUEST', 'label may not contain control or invisible characters');
  }

  // Unauthenticated endpoint: a machine with no identity.json is the primary
  // case. But if valid CLI credentials ARE attached, this is a relink rather
  // than a fresh account, and the caller becomes the link target — the same
  // mechanism auth-link-start.ts uses on the web. An invalid/stale credential
  // must not fail the request; it just falls back to the create branch.
  const caller = await authenticate(event);
  const link_to_user_id = 'user_id' in caller ? caller.user_id : undefined;

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
