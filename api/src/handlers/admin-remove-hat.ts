import type { ApiHandler } from '../lib/http.js';
import { requireAdmin } from '../lib/admin-auth.js';
import { loadAdminConfig } from '../lib/admin-config.js';
import { getStableHorse, removeStableHorseHat } from '../db/stable.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const cfg = await loadAdminConfig();
  const auth = requireAdmin(event, cfg.sessionSecret);
  if (!auth.ok) return err('UNAUTHENTICATED', 'Admin session required');

  const user_id = event.pathParameters?.user_id;
  const stable_horse_id = event.pathParameters?.stable_horse_id;
  const indexRaw = event.pathParameters?.index;
  if (!user_id || !stable_horse_id || indexRaw === undefined) {
    return err('BAD_REQUEST', 'user_id, stable_horse_id and index path parameters required');
  }
  const index = Number(indexRaw);
  if (!Number.isInteger(index) || index < 0) return err('BAD_REQUEST', 'index must be a non-negative integer');

  const existing = await getStableHorse(user_id, stable_horse_id);
  if (!existing) return err('STABLE_HORSE_NOT_FOUND', 'No such horse');
  const hatsLen = existing.hats?.length ?? 0;
  if (index >= hatsLen) return err('BAD_REQUEST', `index out of range (have ${hatsLen} hats)`);

  const updated = await removeStableHorseHat(user_id, stable_horse_id, index);
  return ok(updated);
};
