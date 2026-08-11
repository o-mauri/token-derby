import {
  priceRace, phantomCount, blendedPace, MARKET_OPEN_MIN, FIELD_MEDIAN_PACE,
  tokenMultiplier, scoredOf,
  type MarketRunner, type MarketSnapshot,
} from '@token-derby/shared';
import { getSnapshot, putSnapshot, appendHistory, HISTORY_INTERVAL_MIN, HISTORY_RETENTION_MS } from '../db/markets.js';
import { envRate } from './rate-cap.js';
import type { Race, Horse } from '@token-derby/shared';

export function priceRaceNow(race: Race, horses: Horse[], nowMs: number): MarketSnapshot {
  const bucket = Math.floor(nowMs / 60_000);
  // Price against the bucket, not the wall clock, so simultaneous readers
  // produce byte-identical output.
  const atMs = bucket * 60_000;

  const startMs = new Date(race.start_time).getTime();
  const endMs = new Date(race.end_time).getTime();
  const minutesRemaining = Math.max(1, (endMs - atMs) / 60_000);
  const elapsedFraction = Math.min(1, Math.max(0, (atMs - startMs) / (endMs - startMs)));
  const mult = tokenMultiplier(race);

  const runners: MarketRunner[] = horses.map((h) => {
    const banked = scoredOf(h);
    const elapsedMin = Math.max(0, (atMs - new Date(h.joined_at).getTime()) / 60_000);
    const observed = elapsedMin > 0 ? banked / elapsedMin : 0;
    // prior_pace is stamped output-equivalent; bring it into this race's units.
    const prior = (h.prior_pace ?? FIELD_MEDIAN_PACE) * mult;
    return {
      horse_id: h.horse_id,
      name: h.name,
      division: h.division,
      banked,
      pace: blendedPace({ observed, prior, elapsedMin }),
    };
  });

  const expectedField = Math.max(runners.length, race.expected_field ?? runners.length);
  const phantoms = phantomCount({ elapsedFraction, expectedField });
  const pool = horses
    .map((h) => (h.prior_pace ?? FIELD_MEDIAN_PACE) * mult)
    .filter((p) => p > 0);

  const prices = priceRace({
    race_id: race.race_id,
    runners,
    minutesRemaining,
    phantoms,
    phantomPacePool: pool.length ? pool : [FIELD_MEDIAN_PACE * mult],
    // Same cap clampDelta actually enforces (env override included) — a
    // decided-race verdict must agree with what a horse can really produce.
    maxRemainingPerRunner: envRate() * (minutesRemaining * 60) * mult,
  });

  return {
    race_id: race.race_id,
    bucket,
    computed_at: new Date(atMs).toISOString(),
    phantoms,
    prices,
  };
}

// Markets open MARKET_OPEN_MIN after the off and close at the finish (the
// finish check is the caller's job — see get-markets.ts).
export async function ensureSnapshot(
  race: Race, horses: Horse[], nowMs: number,
): Promise<MarketSnapshot | null> {
  const startMs = new Date(race.start_time).getTime();
  if (nowMs < startMs + MARKET_OPEN_MIN * 60_000) return null;

  const bucket = Math.floor(nowMs / 60_000);
  const existing = await getSnapshot(race.race_id);
  if (existing && existing.bucket === bucket) return existing;

  const snap = priceRaceNow(race, horses, nowMs);
  await putSnapshot(snap);
  if (bucket % HISTORY_INTERVAL_MIN === 0) {
    await appendHistory(snap, HISTORY_RETENTION_MS);
  }
  return snap;
}
