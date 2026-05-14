import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { GetRaceResponse, Horse, HorseView, RaceStatus } from '@token-derby/shared';
import { getRaceByJoinCode, setRaceEnded } from '../db/races.js';
import { listHorses } from '../db/horses.js';
import { computeStatus, timeLeftSeconds } from '../lib/status.js';
import { ok, err } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code required');

  const race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);

  const now = new Date();
  let status: RaceStatus = computeStatus(race, now);

  if (status === 'finished' && !race.ended_at) {
    const iso = now.toISOString();
    await setRaceEnded(race.race_id, iso);
    race.ended_at = iso;
  }

  const horses = await listHorses(race.race_id);
  const ranked = rankHorses(horses);

  const response: GetRaceResponse = {
    race_id: race.race_id,
    name: race.name,
    start_time: race.start_time,
    end_time: race.end_time,
    tz: race.tz,
    max_participants: race.max_participants,
    join_code: race.join_code,
    created_at: race.created_at,
    ended_at: race.ended_at,
    status,
    horses: ranked,
    server_time: now.toISOString(),
    time_left_seconds: timeLeftSeconds(race, now),
  };
  return ok(response);
};

function rankHorses(horses: Horse[]): HorseView[] {
  const sorted = [...horses].sort((a, b) => {
    if (b.current_tokens !== a.current_tokens) return b.current_tokens - a.current_tokens;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });
  return sorted.map((h, i) => ({ ...h, rank: i + 1 }));
}
