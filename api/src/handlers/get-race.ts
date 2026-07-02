import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { GetRaceResponse, Horse, RaceStatus } from '@token-derby/shared';
import { PACE_WINDOW_MS, trailingPace } from '@token-derby/shared';
import { getRaceByJoinCode } from '../db/races.js';
import { listHorses } from '../db/horses.js';
import { listRecentSeriesPoints } from '../db/series.js';
import { computeStatus, timeLeftSeconds } from '../lib/status.js';
import { finaliseRace } from '../lib/finalise-race.js';
import { rankHorses } from '../lib/rank-horses.js';
import { ok, err } from '../lib/http.js';

// Last ~30 points comfortably cover the 15-min window (heartbeats are ≤1/min).
const RECENT_POINTS_LIMIT = 30;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code required');

  let race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);

  const now = new Date();
  const status: RaceStatus = computeStatus(race, now);

  let horses: Horse[];
  if (status === 'finished' && !race.ended_at) {
    const result = await finaliseRace(race, now);
    race = result.race;
    horses = result.horses;
  } else {
    horses = await listHorses(race.race_id);
  }

  const ranked = rankHorses(horses);

  // Trailing 15-min pace, computed from the series points. Live races only —
  // meaningless before a race starts or after it ends. The window is clamped to
  // the race's age so a young race isn't deflated over a full 15 minutes.
  if (status === 'live') {
    const windowMs = Math.min(PACE_WINDOW_MS, now.getTime() - new Date(race.start_time).getTime());
    await Promise.all(ranked.map(async (h) => {
      const points = await listRecentSeriesPoints(race.race_id, h.horse_id, RECENT_POINTS_LIMIT);
      const pace = trailingPace(points, now.getTime(), windowMs);
      if (pace !== null) h.pace_15m = pace;
    }));
  }

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
    ...(race.org_id ? { org_id: race.org_id } : {}),
    ...(race.organisation_name ? { organisation_name: race.organisation_name } : {}),
    ...(race.counts_input ? { counts_input: true } : {}),
    ...(race.primary_top5 ? { primary_top5: true } : {}),
  };
  return ok(response);
};
