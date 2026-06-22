import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { GetRaceSeriesResponse } from '@token-derby/shared';
import { bucketSeries } from '@token-derby/shared';
import { getRaceByJoinCode } from '../db/races.js';
import { listHorses } from '../db/horses.js';
import { listSeriesPoints } from '../db/series.js';
import { ok, err } from '../lib/http.js';

const MAX_POINTS = 180;

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code required');

  const race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);

  const start_ms = new Date(race.start_time).getTime();
  const end_ms = new Date(race.ended_at ?? race.end_time).getTime();

  const horses = await listHorses(race.race_id);
  const series = await Promise.all(
    horses.map(async (h) => ({
      horse_id: h.horse_id,
      points: bucketSeries(await listSeriesPoints(race.race_id, h.horse_id), start_ms, end_ms, MAX_POINTS),
    })),
  );

  const response: GetRaceSeriesResponse = { start_ms, end_ms, horses: series };
  return ok(response);
};
