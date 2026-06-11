import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { AdminOrgsResponse } from '@token-derby/shared';
import { requireAdmin } from '../lib/admin-auth.js';
import { loadAdminConfig } from '../lib/admin-config.js';
import { scanOrganisations } from '../db/admin-scan.js';
import { ok, err } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const cfg = await loadAdminConfig();
  const auth = requireAdmin(event, cfg.sessionSecret);
  if (!auth.ok) return err('UNAUTHENTICATED', 'Admin session required');

  const organisations = await scanOrganisations();
  const response: AdminOrgsResponse = { organisations };
  return ok(response);
};
