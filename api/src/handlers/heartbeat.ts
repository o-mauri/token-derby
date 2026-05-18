import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { HeartbeatRequest, HeartbeatResponse } from '@token-derby/shared';
import { minorMatches } from '@token-derby/shared';
import { getRaceByJoinCode } from '../db/races.js';
import { getHorseForHeartbeat, updateHorseTokens, listHorses } from '../db/horses.js';
import { computeStatus, timeLeftSeconds } from '../lib/status.js';
import { clampHeartbeat } from '../lib/rate-cap.js';
import { rankHorses } from '../lib/rank-horses.js';
import { finaliseRace } from '../lib/finalise-race.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, minCliVersion } from '../lib/version.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const join_code = event.pathParameters?.join_code;
  const horse_id = event.pathParameters?.horse_id;
  if (!join_code || !horse_id) return err('BAD_REQUEST', 'path params required');

  const caller_version = readCliVersion(event);
  if (caller_version && !meetsMinimumCliVersion(caller_version)) {
    return err(
      'VERSION_MISMATCH',
      `This API requires token-derby v${minCliVersion()} or newer. ` +
        `Upgrade: npm i -g @mauricode/token-derby@latest`,
    );
  }

  const auth = event.headers?.authorization ?? event.headers?.Authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return err('INVALID_TOKEN', 'Authorization: Bearer required');

  const body = parseJson<HeartbeatRequest>(event.body);
  if (!body || typeof body.current_tokens !== 'number' || body.current_tokens < 0) {
    return err('BAD_REQUEST', 'current_tokens (non-negative number) required');
  }

  let race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);

  if (race.cli_version) {
    const cli_version = readCliVersion(event);
    if (!minorMatches(cli_version, race.cli_version)) {
      return err(
        'VERSION_MISMATCH',
        `Race requires token-derby v${race.cli_version}. ` +
          `Install: npm i -g @mauricode/token-derby@~${race.cli_version}`,
      );
    }
  }

  const horse = await getHorseForHeartbeat(race.race_id, horse_id, token);
  if (!horse) return err('INVALID_TOKEN', 'heartbeat token does not match');

  const now = new Date();
  const race_status = computeStatus(race, now);

  if (race_status !== 'finished') {
    const accepted = clampHeartbeat({
      previous_tokens: horse.current_tokens,
      previous_heartbeat_iso: horse.last_heartbeat,
      proposed_tokens: body.current_tokens,
      now,
    });
    await updateHorseTokens(race.race_id, horse_id, accepted, now.toISOString());
  }

  let horses;
  if (race_status === 'finished' && !race.ended_at) {
    const result = await finaliseRace(race, now);
    race = result.race;
    horses = result.horses;
  } else {
    horses = await listHorses(race.race_id);
  }

  const response: HeartbeatResponse = {
    race_status,
    server_time: now.toISOString(),
    time_left_seconds: timeLeftSeconds(race, now),
    horses: rankHorses(horses),
    race,
  };
  return ok(response);
};
