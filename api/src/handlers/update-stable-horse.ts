import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { UpdateStableHorseRequest, UpdateStableHorseResponse } from '@token-derby/shared';
import { HORSE_NAME_MAX_LENGTH } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { getStableHorse, updateStableHorse } from '../db/stable.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const stable_horse_id = event.pathParameters?.stable_horse_id;
  if (!stable_horse_id) return err('BAD_REQUEST', 'stable_horse_id path parameter required');

  const body = parseJson<UpdateStableHorseRequest>(event.body);
  if (!body || (body.name === undefined && body.colors === undefined)) {
    return err('BAD_REQUEST', 'Provide name and/or colors to update');
  }

  let name: string | undefined;
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') return err('BAD_REQUEST', 'name must be a string');
    name = body.name.trim();
    if (name.length < 1 || name.length > HORSE_NAME_MAX_LENGTH) {
      return err('BAD_REQUEST', `name must be 1–${HORSE_NAME_MAX_LENGTH} characters`);
    }
  }

  let colors: UpdateStableHorseRequest['colors'];
  if (body.colors !== undefined) {
    const c = body.colors;
    if (!c || typeof c.body !== 'string' || typeof c.mane !== 'string' || typeof c.tail !== 'string' || typeof c.saddle !== 'string') {
      return err('BAD_REQUEST', 'colors.body/mane/tail/saddle are required when colors is set');
    }
    colors = { body: c.body, mane: c.mane, tail: c.tail, saddle: c.saddle };
  }

  const existing = await getStableHorse(auth.user_id, stable_horse_id);
  if (!existing) return err('STABLE_HORSE_NOT_FOUND', 'No such horse in your stable');

  try {
    const next = await updateStableHorse(auth.user_id, existing, { name, colors });
    const response: UpdateStableHorseResponse = next;
    return ok(response);
  } catch (e: any) {
    if (e?.name === 'TransactionCanceledException' || e?.name === 'ConditionalCheckFailedException') {
      return err('STABLE_HORSE_NAME_TAKEN', `You already have a horse named "${name}"`);
    }
    throw e;
  }
};
