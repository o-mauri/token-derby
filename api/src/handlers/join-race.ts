import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { JoinRaceRequest, JoinRaceResponse } from '@token-derby/shared';
import { minorMatches } from '@token-derby/shared';
import { generateHorseId, generateHeartbeatToken } from '../lib/codes.js';
import { getRaceByJoinCode } from '../db/races.js';
import { putHorse, countHorses, findHorseByUser, rotateHeartbeatToken } from '../db/horses.js';
import { computeStatus } from '../lib/status.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion } from '../lib/version.js';
import { readIdentity } from '../lib/identity.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code path parameter required');

  const identity = readIdentity(event);
  if ('error' in identity) return err('IDENTITY_REQUIRED', identity.error);

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

  // Races created before version pinning shipped have no cli_version — they predate the feature.
  // For new races (with cli_version) the joiner must match the race's MAJOR.MINOR.
  if (race.cli_version) {
    const cli_version = readCliVersion(event);
    if (!minorMatches(cli_version, race.cli_version)) {
      return err(
        'VERSION_MISMATCH',
        `This race was created with token-derby v${race.cli_version}. ` +
          `Install a matching version: npm i -g @mauricode/token-derby@~${race.cli_version}`,
      );
    }
  }

  // Identity-aware resume: if this user already has a horse in this race, either
  // resume it (same name) or reject (different name).
  const existing_horse = await findHorseByUser(race.race_id, identity.user_id);
  if (existing_horse) {
    if (existing_horse.name === body.horse.name) {
      const new_token = generateHeartbeatToken();
      await rotateHeartbeatToken(race.race_id, existing_horse.horse_id, new_token);
      const resume: JoinRaceResponse = {
        horse_id: existing_horse.horse_id,
        heartbeat_token: new_token,
      };
      return ok(resume);
    }
    return err(
      'DUPLICATE_HORSE',
      `You're already in this race as '${existing_horse.name}'. ` +
        `Run \`token-derby join ${join_code}\` to resume.`,
    );
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
      user_id: identity.user_id,
      user_name: identity.user_name,
    },
    heartbeat_token,
  );

  const response: JoinRaceResponse = { horse_id, heartbeat_token };
  return ok(response);
};
