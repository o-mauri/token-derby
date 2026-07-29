import type { ApiHandler } from '../lib/http.js';
import type { EndRaceResponse } from '@token-derby/shared';
import { getRaceByAdminCode } from '../db/races.js';
import { finaliseRace } from '../lib/finalise-race.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const admin_code = event.pathParameters?.admin_code;
  if (!admin_code) return err('BAD_REQUEST', 'admin_code required');

  const race = await getRaceByAdminCode(admin_code);
  if (!race) return err('RACE_NOT_FOUND', 'No race for that admin code');

  await finaliseRace(race, new Date());

  const response: EndRaceResponse = { ok: true };
  return ok(response);
};
