import type { ApiHandler } from '../lib/http.js';
import type { GetRaceSeriesResponse } from '@token-derby/shared';
import { getRaceByJoinCode } from '../db/races.js';
import { listHorses } from '../db/horses.js';
import { listSeriesPoints } from '../db/series.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code required');

  const race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);

  const start_ms = new Date(race.start_time).getTime();
  const end_ms = new Date(race.ended_at ?? race.end_time).getTime();

  // Return the raw recorded deltas (already at most ~1 per minute, since the CLI
  // heartbeats every 60s and only writes a point when delta > 0). The client
  // resamples these onto a uniform 1-minute tick grid for rendering.
  const horses = await listHorses(race.race_id);
  const series = await Promise.all(
    horses.map(async (h) => ({
      horse_id: h.horse_id,
      points: await listSeriesPoints(race.race_id, h.horse_id),
    })),
  );

  const response: GetRaceSeriesResponse = { start_ms, end_ms, horses: series };
  return ok(response);
};
