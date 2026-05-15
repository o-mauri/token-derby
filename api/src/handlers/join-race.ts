import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { JoinRaceRequest, JoinRaceResponse } from '@token-derby/shared';
import { minorMatches } from '@token-derby/shared';
import { generateHorseId, generateHeartbeatToken } from '../lib/codes.js';
import { getRaceByJoinCode } from '../db/races.js';
import { putHorse, countHorses, findHorseByUser, rotateHeartbeatToken } from '../db/horses.js';
import { isMember } from '../db/organisations.js';
import { getStableHorse } from '../db/stable.js';
import { computeStatus } from '../lib/status.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, minCliVersion } from '../lib/version.js';
import { authenticate } from '../lib/auth.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code path parameter required');

  const caller_version = readCliVersion(event);
  if (caller_version && !meetsMinimumCliVersion(caller_version)) {
    return err(
      'VERSION_MISMATCH',
      `This API requires token-derby v${minCliVersion()} or newer. ` +
        `Upgrade: npm i -g @mauricode/token-derby@latest`,
    );
  }

  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const body = parseJson<JoinRaceRequest>(event.body);
  if (!body || typeof body.stable_horse_id !== 'string' || !body.stable_horse_id) {
    return err('BAD_REQUEST', 'stable_horse_id is required');
  }

  const stable_horse = await getStableHorse(auth.user_id, body.stable_horse_id);
  if (!stable_horse) {
    return err('STABLE_HORSE_NOT_FOUND', 'No such horse in your stable');
  }

  const race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);
  if (computeStatus(race, new Date()) === 'finished') {
    return err('RACE_FINISHED', 'This race has ended');
  }

  // Gate org-restricted races on membership before any horse-state lookup so
  // non-members can't probe existing horses via repeated joins.
  if (race.org_id && !(await isMember(race.org_id, auth.user_id))) {
    const org_label = race.organisation_name ?? race.org_id;
    return err('NOT_ORG_MEMBER', `This race is restricted to members of "${org_label}"`);
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
  const existing_horse = await findHorseByUser(race.race_id, auth.user_id);
  if (existing_horse) {
    if (existing_horse.name === stable_horse.name) {
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
      stable_horse_id: stable_horse.stable_horse_id,
      name: stable_horse.name,
      colors: stable_horse.colors,
      current_tokens: 0,
      last_heartbeat: now,
      joined_at: now,
      user_id: auth.user_id,
      user_name: auth.display_name,
      xp: stable_horse.xp,
    },
    heartbeat_token,
  );

  const response: JoinRaceResponse = { horse_id, heartbeat_token };
  return ok(response);
};
