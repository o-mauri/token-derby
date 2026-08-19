import type { ApiHandler } from '../lib/http.js';
import type { ClaimProbeResponse } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { lookupClaim } from '../lib/redeem-claim.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const rawCode = event.pathParameters?.code;
  if (!rawCode) return err('BAD_REQUEST', 'code path parameter required');

  const found = await lookupClaim(rawCode, auth.user_id);
  if (!found.ok) return err(found.code, found.message);

  // Deliberately omits hat_id — the reveal animation is the payoff.
  const response: ClaimProbeResponse = { item_type: found.claim.item_type };
  return ok(response);
};
