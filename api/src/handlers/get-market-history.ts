import type { ApiHandler } from '../lib/http.js';
import type { GetMarketHistoryResponse } from '@token-derby/shared';
import { getRaceByJoinCode } from '../db/races.js';
import { listHistory } from '../db/markets.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code required');

  const race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);

  const response: GetMarketHistoryResponse = { history: await listHistory(race.race_id) };
  return ok(response);
};
