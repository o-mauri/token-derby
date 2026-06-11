import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { AdminRenameUserRequest } from '@token-derby/shared';
import { USER_NAME_MAX_LENGTH } from '@token-derby/shared';
import { requireAdmin } from '../lib/admin-auth.js';
import { loadAdminConfig } from '../lib/admin-config.js';
import { updateUserDisplayName } from '../db/users.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const cfg = await loadAdminConfig();
  const auth = requireAdmin(event, cfg.sessionSecret);
  if (!auth.ok) return err('UNAUTHENTICATED', 'Admin session required');

  const user_id = event.pathParameters?.user_id;
  if (!user_id) return err('BAD_REQUEST', 'user_id path parameter required');

  const body = parseJson<AdminRenameUserRequest>(event.body);
  if (!body || typeof body.display_name !== 'string') return err('BAD_REQUEST', 'display_name is required');
  const display_name = body.display_name.trim();
  if (display_name.length < 1 || display_name.length > USER_NAME_MAX_LENGTH) {
    return err('BAD_REQUEST', `display_name must be 1–${USER_NAME_MAX_LENGTH} characters`);
  }

  try {
    await updateUserDisplayName(user_id, display_name);
  } catch (e: any) {
    if (e?.name === 'ConditionalCheckFailedException') return err('USER_NOT_FOUND', 'No such user');
    throw e;
  }
  return ok({ user_id, display_name });
};
