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

  const records = await listClaims();
  const claims: AdminClaim[] = records.map(r => {
    const { created_by, ...rest } = r;
    return rest as AdminClaim;
  });
  const response: AdminClaimsResponse = { claims };
  return ok(response);
};
