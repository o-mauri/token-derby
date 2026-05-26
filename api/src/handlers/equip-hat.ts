import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { EquipHatRequest, EquipHatResponse } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { getStableHorse, equipHat } from '../db/stable.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const stable_horse_id = event.pathParameters?.stable_horse_id;
  if (!stable_horse_id) return err('BAD_REQUEST', 'stable_horse_id path parameter required');

  const body = parseJson<EquipHatRequest>(event.body);
  if (!body || (body.hat_index !== null && typeof body.hat_index !== 'number')) {
    return err('BAD_REQUEST', 'hat_index must be a number or null');
  }

  const horse = await getStableHorse(auth.user_id, stable_horse_id);
  if (!horse) return err('STABLE_HORSE_NOT_FOUND', 'No such horse in your stable');

  if (body.hat_index !== null) {
    const hatsLen = horse.hats?.length ?? 0;
    if (body.hat_index < 0 || body.hat_index >= hatsLen) {
      return err('BAD_REQUEST', `hat_index out of range (have ${hatsLen} hats)`);
    }
  }

  await equipHat(auth.user_id, stable_horse_id, body.hat_index);
  const updated = await getStableHorse(auth.user_id, stable_horse_id);
  const response: EquipHatResponse = updated!;
  return ok(response);
};
