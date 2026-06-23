import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { JoinRaceRequest, JoinRaceResponse, CollectedHat, ModelKey } from '@token-derby/shared';
import { minorMatches, isModelKey } from '@token-derby/shared';
import { generateHorseId, generateHeartbeatToken } from '../lib/codes.js';
import { getRaceByJoinCode } from '../db/races.js';
import { putHorse, countHorses, findHorseByUser, rotateHeartbeatToken } from '../db/horses.js';
import { isMember } from '../db/organisations.js';
import { getStableHorse } from '../db/stable.js';
import { computeStatus } from '../lib/status.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';
import { authenticate } from '../lib/auth.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code path parameter required');

  const caller_version = readCliVersion(event);
  if (!caller_version || !meetsMinimumCliVersion(caller_version)) {
    return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const body = parseJson<JoinRaceRequest>(event.body);
  if (!body || typeof body.stable_horse_id !== 'string' || !body.stable_horse_id) {
    return err('BAD_REQUEST', 'stable_horse_id is required');
  }

  if (body.primary_model !== undefined && !isModelKey(body.primary_model)) {
    return err('BAD_REQUEST', 'primary_model must be one of claude, codex, gemini');
  }
  const primary_model: ModelKey = isModelKey(body.primary_model) ? body.primary_model : 'claude';

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
        primary_model: existing_horse.primary_model ?? 'claude',
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

  // Snapshot the equipped hat (if any) onto the race-Horse so it persists for
  // the duration of the race even if the player changes their stable equip
  // after the race starts.
  let equipped_hat: CollectedHat | undefined;
  if (typeof stable_horse.equipped_hat === 'number') {
    const hat = stable_horse.hats?.[stable_horse.equipped_hat];
    if (hat) equipped_hat = hat;
  }

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
      primary_model,
      ...(equipped_hat ? { equipped_hat } : {}),
    },
    heartbeat_token,
  );

  const response: JoinRaceResponse = { horse_id, heartbeat_token, primary_model };
  return ok(response);
};
