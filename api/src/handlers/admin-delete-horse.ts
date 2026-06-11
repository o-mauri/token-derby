import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { requireAdmin } from '../lib/admin-auth.js';
import { loadAdminConfig } from '../lib/admin-config.js';
import { getStableHorse, deleteStableHorse } from '../db/stable.js';
import { ok, err } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const cfg = await loadAdminConfig();
  if (!requireAdmin(event, cfg.sessionSecret).ok) return err('UNAUTHENTICATED', 'Admin session required');

  const user_id = event.pathParameters?.user_id;
  const stable_horse_id = event.pathParameters?.stable_horse_id;
  if (!user_id || !stable_horse_id) return err('BAD_REQUEST', 'user_id and stable_horse_id path parameters required');

  const existing = await getStableHorse(user_id, stable_horse_id);
  if (!existing) return err('STABLE_HORSE_NOT_FOUND', 'No such horse');

  await deleteStableHorse(user_id, existing);
  return ok({ deleted: true });
};
