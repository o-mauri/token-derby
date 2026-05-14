import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { EndRaceResponse } from '@token-derby/shared';
import { getRaceByAdminCode, setRaceEnded } from '../db/races.js';
import { listHorses, setHorseFinalTokens, incrementLootTokens } from '../db/horses.js';
import { ok, err } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const admin_code = event.pathParameters?.admin_code;
  if (!admin_code) return err('BAD_REQUEST', 'admin_code required');

  const race = await getRaceByAdminCode(admin_code);
  if (!race) return err('RACE_NOT_FOUND', 'No race for that admin code');

  const alreadyEnded = Boolean(race.ended_at);

  if (!alreadyEnded) {
    await setRaceEnded(race.race_id, new Date().toISOString());
  }

  const horses = await listHorses(race.race_id);
  await Promise.all(
    horses
      .filter(h => h.final_tokens === undefined)
      .map(h => setHorseFinalTokens(race.race_id, h.horse_id, h.current_tokens)),
  );

  if (!alreadyEnded && horses.length > 0) {
    const withFinals = horses.map(h => ({
      ...h,
      final_tokens: h.final_tokens ?? h.current_tokens,
    }));
    const winner = withFinals.reduce((best, h) =>
      h.final_tokens > best.final_tokens ? h : best
    );
    await incrementLootTokens(race.race_id, winner.horse_id);
  }

  const response: EndRaceResponse = { ok: true };
  return ok(response);
};
