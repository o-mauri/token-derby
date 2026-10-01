import type { ApiHandler } from '../lib/http.js';
import type { AdminClaim, AdminClaimsResponse } from '@token-derby/shared';
import { requireAdmin } from '../lib/admin-auth.js';
import { loadAdminConfig } from '../lib/admin-config.js';
import { listClaims } from '../db/claims.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const cfg = await loadAdminConfig();
  const auth = requireAdmin(event, cfg.sessionSecret);
  if (!auth.ok) return err('UNAUTHENTICATED', 'Admin session required');

  const claims: AdminClaim[] = (await listClaims()).map(c => ({
    code: c.code,
    item_type: c.item_type,
    entries: c.entries,
    max_redemptions: c.max_redemptions,
    redeemed_count: c.redeemed_count,
    created_at: c.created_at,
    expires_at: c.expires_at,
  }));
  const response: AdminClaimsResponse = { claims };
  return ok(response);
};
