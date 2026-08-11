import type { ApiHandler } from '../lib/http.js';
import type { CreateStableHorseRequest, CreateStableHorseResponse, StableHorse } from '@token-derby/shared';
import { HORSE_NAME_MAX_LENGTH } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { putStableHorse } from '../db/stable.js';
import { generateHorseId } from '../lib/codes.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const body = parseJson<CreateStableHorseRequest>(event.body);
  if (!body || typeof body.name !== 'string' || !body.colors) {
    return err('BAD_REQUEST', 'name and colors are required');
  }
  const name = body.name.trim();
  if (name.length < 1 || name.length > HORSE_NAME_MAX_LENGTH) {
    return err('BAD_REQUEST', `name must be 1–${HORSE_NAME_MAX_LENGTH} characters`);
  }
  const c = body.colors;
  if (typeof c.body !== 'string' || typeof c.mane !== 'string' || typeof c.tail !== 'string' || typeof c.saddle !== 'string') {
    return err('BAD_REQUEST', 'colors.body/mane/tail/saddle are required');
  }

  const horse: StableHorse = {
    stable_horse_id: generateHorseId(),
    name,
    colors: { body: c.body, mane: c.mane, tail: c.tail, saddle: c.saddle },
    created_at: new Date().toISOString(),
    xp: 0,
  };
  try {
    await putStableHorse(auth.user_id, horse);
  } catch (e: any) {
    if (e?.name === 'TransactionCanceledException' || e?.name === 'ConditionalCheckFailedException') {
      return err('STABLE_HORSE_NAME_TAKEN', `You already have a horse named "${name}"`);
    }
    throw e;
  }
  const response: CreateStableHorseResponse = horse;
  return ok(response);
};
