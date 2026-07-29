import type { ApiHandler } from '../lib/http.js';
import type { AdminRenameHorseRequest } from '@token-derby/shared';
import { HORSE_NAME_MAX_LENGTH } from '@token-derby/shared';
import { requireAdmin } from '../lib/admin-auth.js';
import { loadAdminConfig } from '../lib/admin-config.js';
import { getStableHorse, updateStableHorse } from '../db/stable.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const cfg = await loadAdminConfig();
  const auth = requireAdmin(event, cfg.sessionSecret);
  if (!auth.ok) return err('UNAUTHENTICATED', 'Admin session required');

  const user_id = event.pathParameters?.user_id;
  const stable_horse_id = event.pathParameters?.stable_horse_id;
  if (!user_id || !stable_horse_id) return err('BAD_REQUEST', 'user_id and stable_horse_id path parameters required');

  const body = parseJson<AdminRenameHorseRequest>(event.body);
  if (!body || typeof body.name !== 'string') return err('BAD_REQUEST', 'name is required');
  const name = body.name.trim();
  if (name.length < 1 || name.length > HORSE_NAME_MAX_LENGTH) {
    return err('BAD_REQUEST', `name must be 1–${HORSE_NAME_MAX_LENGTH} characters`);
  }

  const existing = await getStableHorse(user_id, stable_horse_id);
  if (!existing) return err('STABLE_HORSE_NOT_FOUND', 'No such horse');

  try {
    const next = await updateStableHorse(user_id, existing, { name });
    return ok(next);
  } catch (e: any) {
    if (e?.name === 'TransactionCanceledException' || e?.name === 'ConditionalCheckFailedException') {
      return err('STABLE_HORSE_NAME_TAKEN', `That user already has a horse named "${name}"`);
    }
    throw e;
  }
};
