// Throwaway: price a live race locally against production data and emit the
// JSON the /preview-live board reads. Read-only — nothing is written to
// DynamoDB. Needed because derbymarket is not deployed, so /api/.../markets
// does not exist yet.
//
//   AWS_PROFILE=personal AWS_REGION=eu-west-2 \
//     npx tsx api/scripts/preview-live-market.ts LSRNA7 > /dev/null
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRaceByJoinCode } from '../src/db/races.js';
import { listHorses } from '../src/db/horses.js';
import { getStableHorse } from '../src/db/stable.js';
import { listSeriesPoints } from '../src/db/series.js';
import { stampDivisions } from '../src/lib/divisions.js';
import { priceRaceNow } from '../src/lib/price-race.js';
import { HISTORY_INTERVAL_MIN } from '../src/db/markets.js';
import { rankHorses } from '../src/lib/rank-horses.js';
import {
  recentPacePrior, scoredOf, FIELD_MEDIAN_PACE, MARKET_OPEN_MIN,
  type MarketSnapshot,
} from '@token-derby/shared';

const joinCode = process.argv[2] ?? 'LSRNA7';
const OUT = resolve(import.meta.dirname, '../../site/dist/live-market.json');

async function main(): Promise<void> {
  const race = await getRaceByJoinCode(joinCode);
  if (!race) throw new Error(`no race with join code ${joinCode}`);
  const horses = await listHorses(race.race_id);
  if (!horses.length) throw new Error('race has no horses');

  // prior_pace is stamped at join by code that has not shipped, so this race
  // carries none. Synthesise it from the backfilled stable-horse recent_paces,
  // exactly as join-race would have.
  for (const h of horses) {
    if (h.prior_pace !== undefined || !h.stable_horse_id || !h.user_id) continue;
    const stable = await getStableHorse(h.user_id, h.stable_horse_id);
    h.prior_pace = recentPacePrior(stable?.recent_paces, FIELD_MEDIAN_PACE);
  }

  const divisionNames = await stampDivisions(race, horses);

  const nowMs = Date.now();
  const snapshot = priceRaceNow(race, horses, nowMs);

  // History: rewind each horse's bank by subtracting the heartbeat deltas that
  // landed after the bucket, then re-price. POINT rows record the raw applied
  // delta, so scale by the horse's own scored/raw ratio to get scored tokens.
  const deltas = new Map<string, Array<{ t: number; d: number }>>();
  for (const h of horses) {
    deltas.set(h.horse_id, await listSeriesPoints(race.race_id, h.horse_id));
  }

  const startMs = new Date(race.start_time).getTime();
  const openMs = startMs + MARKET_OPEN_MIN * 60_000;
  const step = HISTORY_INTERVAL_MIN * 60_000;
  const firstBucket = Math.ceil(openMs / step) * step;

  const history: MarketSnapshot[] = [];
  for (let t = firstBucket; t <= nowMs; t += step) {
    const past = horses
      .filter((h) => new Date(h.joined_at).getTime() <= t)
      .map((h) => {
        const raw = h.current_tokens;
        const ratio = raw > 0 ? scoredOf(h) / raw : 1;
        const after = (deltas.get(h.horse_id) ?? [])
          .filter((p) => p.t > t)
          .reduce((a, p) => a + p.d, 0);
        return { ...h, scored_tokens: Math.max(0, (raw - after) * ratio) };
      });
    if (past.length < 2) continue;
    history.push(priceRaceNow(race, past, t));
  }

  const ranked = rankHorses(horses);
  const out = {
    generated_at: new Date(nowMs).toISOString(),
    joinCode,
    raceName: race.name,
    runnerCount: horses.length,
    timeLeftSeconds: Math.max(0, Math.round((new Date(race.end_time).getTime() - nowMs) / 1000)),
    finished: false,
    divisionNames,
    horses: ranked.map((h) => ({
      horse_id: h.horse_id,
      name: h.name,
      colors: h.colors,
      division: h.division,
      jockey: h.user_name,
      banked: scoredOf(h),
      rank: h.rank,
      prior_pace: Math.round(horses.find((x) => x.horse_id === h.horse_id)!.prior_pace ?? 0),
    })),
    prices: snapshot.prices,
    history,
  };

  writeFileSync(OUT, JSON.stringify(out));
  console.error(
    `${race.name} · ${horses.length} runners · ${history.length} history buckets · ` +
    `${Math.round(out.timeLeftSeconds / 60)} min left -> ${OUT}`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
