import type { ApiHandler } from '../lib/http.js';
import type { GetMarketsResponse } from '@token-derby/shared';
import { MARKET_OPEN_MIN, scoredOf } from '@token-derby/shared';
import { getRaceByJoinCode } from '../db/races.js';
import { listHorses } from '../db/horses.js';
import { computeStatus } from '../lib/status.js';
import { ensureSnapshot } from '../lib/price-race.js';
import { stampDivisions } from '../lib/divisions.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const join_code = event.pathParameters?.join_code;
  if (!join_code) return err('BAD_REQUEST', 'join_code required');

  const race = await getRaceByJoinCode(join_code);
  if (!race) return err('RACE_NOT_FOUND', `No race with join code ${join_code}`);

  const now = new Date();
  const status = computeStatus(race, now);

  // Closed at the finish — no countdown, the market is simply over.
  if (status === 'finished') {
    return ok<GetMarketsResponse>({ open: false });
  }

  const opensAtMs = new Date(race.start_time).getTime() + MARKET_OPEN_MIN * 60_000;
  const nowMs = now.getTime();
  if (nowMs < opensAtMs) {
    return ok<GetMarketsResponse>({
      open: false,
      opens_in_seconds: Math.ceil((opensAtMs - nowMs) / 1000),
    });
  }

  const horses = await listHorses(race.race_id);
  // League fixtures: stamp division before pricing so the win/podium markets
  // split by division, not just overall.
  await stampDivisions(race, horses);
  const snapshot = await ensureSnapshot(race, horses, nowMs);
  // Defensive only: ensureSnapshot returns null before the open, which the
  // check above already excludes.
  if (!snapshot) {
    return ok<GetMarketsResponse>({ open: false, opens_in_seconds: 0 });
  }

  const response: GetMarketsResponse = {
    open: true,
    snapshot,
    horses: horses.map((h) => ({
      horse_id: h.horse_id,
      name: h.name,
      colors: h.colors,
      division: h.division,
      scored_tokens: scoredOf(h),
    })),
  };
  return ok(response);
};
