import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { JoinRaceRequest, JoinRaceResponse } from '@token-derby/shared';
import { generateHorseId, generateHeartbeatToken } from '../lib/codes.js';
import { getRaceByJoinCode } from '../db/races.js';
import { putHorse, countHorses } from '../db/horses.js';
import { computeStatus } from '../lib/status.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code path parameter required');

  const body = parseJson<JoinRaceRequest>(event.body);
  if (!body?.horse?.name || !body.horse.colors) {
    return err('BAD_REQUEST', 'horse.name and horse.colors required');
  }
  const c = body.horse.colors;
  if (!c.body || !c.mane || !c.tail || !c.saddle) {
    return err('BAD_REQUEST', 'horse.colors.body/mane/tail/saddle required');
  }

  const race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);
  if (computeStatus(race, new Date()) === 'finished') {
    return err('RACE_FINISHED', 'This race has ended');
  }

  const existing = await countHorses(race.race_id);
  if (existing >= race.max_participants) {
    return err('RACE_FULL', `This race is full (${race.max_participants}/${race.max_participants} horses)`);
  }

  const horse_id = generateHorseId();
  const heartbeat_token = generateHeartbeatToken();
  const now = new Date().toISOString();

  await putHorse(
    race.race_id,
    {
      horse_id,
      name: body.horse.name,
      colors: body.horse.colors,
      current_tokens: 0,
      last_heartbeat: now,
      joined_at: now,
    },
    heartbeat_token,
  );

  const response: JoinRaceResponse = { horse_id, heartbeat_token };
  return ok(response);
};
