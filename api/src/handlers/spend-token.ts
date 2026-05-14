import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { SpendTokenRequest, SpendTokenResponse } from '@token-derby/shared';
import { getRaceByJoinCode } from '../db/races.js';
import { getHorseForHeartbeat, spendLootToken } from '../db/horses.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const { join_code, horse_id } = event.pathParameters ?? {};
  if (!join_code || !horse_id) return err('BAD_REQUEST', 'join_code and horse_id required');

  const body = parseJson<SpendTokenRequest>(event.body);
  if (!body?.heartbeat_token) return err('BAD_REQUEST', 'heartbeat_token required');

  const race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', 'No race with that join code');

  const horse = await getHorseForHeartbeat(race.race_id, horse_id, body.heartbeat_token);
  if (!horse) return err('INVALID_TOKEN', 'Invalid heartbeat token');

  const spent = await spendLootToken(race.race_id, horse_id);
  if (!spent) return err('INSUFFICIENT_TOKENS', 'No loot tokens available');

  const response: SpendTokenResponse = { ok: true };
  return ok(response);
};
