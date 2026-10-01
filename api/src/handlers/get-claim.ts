import type { ApiHandler } from '../lib/http.js';
import type { ClaimProbeResponse } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { lookupClaim } from '../lib/redeem-claim.js';
import { ok, err } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';

export const handler: ApiHandler = async (event) => {
  // The CLI bundles the hat catalog, so a stale CLI cannot name a newer hat.
  // Gate before anything else, so a rejected call never consumes a slot.
  const caller_version = readCliVersion(event);
  if (!caller_version || !meetsMinimumCliVersion(caller_version)) {
    return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const rawCode = event.pathParameters?.code;
  if (!rawCode) return err('BAD_REQUEST', 'code path parameter required');

  const found = await lookupClaim(rawCode, auth.user_id);
  if (!found.ok) return err(found.code, found.message);

  // Deliberately omits hat identity — the reveal animation is the payoff.
  const response: ClaimProbeResponse = {
    item_type: found.claim.item_type,
    entry_count: found.claim.entries.length,
    remaining: found.claim.max_redemptions - found.claim.redeemed_count,
  };
  return ok(response);
};
