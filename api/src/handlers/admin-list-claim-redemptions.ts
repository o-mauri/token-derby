import type { ApiHandler } from '../lib/http.js';
import type { AdminClaimRedemptionsResponse } from '@token-derby/shared';
import { normaliseClaimCode } from '@token-derby/shared';
import { requireAdmin } from '../lib/admin-auth.js';
import { loadAdminConfig } from '../lib/admin-config.js';
import { listClaimRedemptions, getClaim } from '../db/claims.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const cfg = await loadAdminConfig();
  const auth = requireAdmin(event, cfg.sessionSecret);
  if (!auth.ok) return err('UNAUTHENTICATED', 'Admin session required');

  const code = normaliseClaimCode(event.pathParameters?.code ?? '');
  if (!code) return err('BAD_REQUEST', 'code path parameter required');

  const response: AdminClaimRedemptionsResponse = { redemptions: await listClaimRedemptions(code) };

  // Pre-pack rows recorded their single redemption on META and have no
  // REDEEM child, so reconstruct it rather than showing the claim as unused.
  if (response.redemptions.length === 0) {
    const claim = await getClaim(code);
    if (claim?.redeemed_at && claim.redeemed_by) {
      response.redemptions.push({
        user_id: claim.redeemed_by,
        user_name: claim.redeemed_by_name,
        horse_id: claim.redeemed_horse_id ?? '',
        horse_name: claim.redeemed_horse_name,
        redeemed_at: claim.redeemed_at,
        outcome: claim.outcome ?? 'hat',
        hat_id: claim.hat_id ?? claim.entries[0]?.hat_id ?? '',
        variant: claim.variant,
        xp_awarded: claim.xp_awarded,
      });
    }
  }
  return ok(response);
};
