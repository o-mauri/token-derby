import type { ApiHandler } from '../lib/http.js';
import type { AdminUsersResponse } from '@token-derby/shared';
import { requireAdmin } from '../lib/admin-auth.js';
import { loadAdminConfig } from '../lib/admin-config.js';
import { scanUsersWithHorses } from '../db/admin-scan.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const cfg = await loadAdminConfig();
  const auth = requireAdmin(event, cfg.sessionSecret);
  if (!auth.ok) return err('UNAUTHENTICATED', 'Admin session required');

  const users = await scanUsersWithHorses();
  const response: AdminUsersResponse = { users };
  return ok(response);
};
