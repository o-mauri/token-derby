import type { ApiHandler } from '../lib/http.js';
import type { DeleteStableHorseResponse } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { getStableHorse, deleteStableHorse } from '../db/stable.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const stable_horse_id = event.pathParameters?.stable_horse_id;
  if (!stable_horse_id) return err('BAD_REQUEST', 'stable_horse_id path parameter required');

  const existing = await getStableHorse(auth.user_id, stable_horse_id);
  if (!existing) return err('STABLE_HORSE_NOT_FOUND', 'No such horse in your stable');

  await deleteStableHorse(auth.user_id, existing);
  const response: DeleteStableHorseResponse = { ok: true };
  return ok(response);
};
