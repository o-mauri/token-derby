// Price a live race locally against production data, with the attendance
// model, and emit the JSON the /preview-live board reads. Read-only: the
// backfill (spans, raw paces) and the habit fit run in memory, nothing is
// written to DynamoDB.
//
//   AWS_PROFILE=personal AWS_REGION=eu-west-2 \
//     npx tsx api/scripts/preview-live-market.ts Q79KSH
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRaceByJoinCode, listRacesByOrgId } from '../src/db/races.js';
import { listHorses } from '../src/db/horses.js';
import { getStableHorse } from '../src/db/stable.js';
import { listSeriesPoints } from '../src/db/series.js';
import { stampDivisions } from '../src/lib/divisions.js';
import { priceRaceNow, type RaceRoster, type NotJoinedPlayer } from '../src/lib/price-race.js';
import { buildHabitRows, HABIT_WINDOW_MS } from '../src/lib/fit-habits.js';
import { ORG_HABIT_ID, type HabitRow } from '../src/db/habits.js';
import { HISTORY_INTERVAL_MIN } from '../src/db/markets.js';
import { rankHorses } from '../src/lib/rank-horses.js';
import {
  recentPacePrior, scoredOf, prepareHabit, decodeDensity, FIELD_MEDIAN_PACE, MARKET_OPEN_MIN,
  MIN_PACE_RACE_MINUTES, type Horse, type Race, type SeriesPoint, type MarketSnapshot, type PreparedHabit,
} from '@token-derby/shared';

const joinCode = process.argv[2] ?? 'Q79KSH';
const OUT = resolve(import.meta.dirname, '../../site/dist/live-market.json');
// Races from before input was always counted scored output only.
const OUTPUT_ONLY_SCALE = 10;

const iso = (t: number) => new Date(t).toISOString();

// The span the heartbeat would have recorded, from the horse's scoring points up to `untilMs`.
function withSpan(h: Horse, points: SeriesPoint[], untilMs = Infinity): Horse {
  const scoring = points.filter((p) => p.d > 0 && p.t <= untilMs);
  const { first_scored_at: _f, last_scored_at: _l, ...rest } = h;
  if (scoring.length === 0) return rest;
  return { ...rest, first_scored_at: iso(scoring[0]!.t), last_scored_at: iso(scoring[scoring.length - 1]!.t) };
}

async function pointsFor(race_id: string, horses: Horse[]): Promise<Map<string, SeriesPoint[]>> {
  const out = new Map<string, SeriesPoint[]>();
  await Promise.all(horses.map(async (h) => { out.set(h.horse_id, await listSeriesPoints(race_id, h.horse_id)); }));
  return out;
}

// Raw pace per present minute for one finished race horse, as the backfill records it.
function paceOf(race: Race, h: Horse): number | null {
  const raw = Number(h.final_tokens ?? h.current_tokens ?? 0);
  const windowMin = h.first_scored_at && h.last_scored_at
    ? (Date.parse(h.last_scored_at) - Date.parse(h.first_scored_at)) / 60_000
    : (Date.parse(race.ended_at!) - Date.parse(h.joined_at)) / 60_000;
  if (!(windowMin >= MIN_PACE_RACE_MINUTES)) return null;
  const scale = (race as { counts_input?: boolean }).counts_input || h.model_tokens ? 1 : OUTPUT_ONLY_SCALE;
  return Math.max(0, (raw * scale) / windowMin);
}

async function main(): Promise<void> {
  const race = await getRaceByJoinCode(joinCode);
  if (!race) throw new Error(`no race with join code ${joinCode}`);
  if (!race.org_id) throw new Error('race has no org, so there are no habits to fit');
  const nowMs = Date.now();

  // 1. In-memory backfill over the org's finished races: spans where points survive, raw paces.
  const finished = (await listRacesByOrgId(race.org_id))
    .filter((r) => r.ended_at && r.race_id !== race.race_id)
    .sort((a, b) => a.ended_at!.localeCompare(b.ended_at!));
  const recent = finished.filter((r) => nowMs - Date.parse(r.ended_at!) <= HABIT_WINDOW_MS);
  const horsesByRace = new Map<string, Horse[]>();
  const paces = new Map<string, number[]>();   // stable_horse_id -> oldest first
  let stamped = 0;
  for (const r of finished) {
    let horses = await listHorses(r.race_id);
    if (recent.includes(r)) {
      const pts = await pointsFor(r.race_id, horses);
      horses = horses.map((h) => {
        if (h.first_scored_at && h.last_scored_at) return h;
        const s = withSpan(h, pts.get(h.horse_id) ?? []);
        if (s.first_scored_at) stamped++;
        return s;
      });
      horsesByRace.set(r.race_id, horses);
    }
    for (const h of horses) {
      if (!h.stable_horse_id) continue;
      const p = paceOf(r, h);
      if (p !== null) paces.set(h.stable_horse_id, [...(paces.get(h.stable_horse_id) ?? []), p]);
    }
  }
  const priorFor = (sid?: string) => recentPacePrior(sid ? paces.get(sid) : undefined, FIELD_MEDIAN_PACE);

  // 2. Habit fit, in memory.
  const rows = buildHabitRows(recent, horsesByRace, nowMs);
  const prepared = new Map<string, { row: HabitRow; habit: PreparedHabit }>(rows.map((row) => [
    row.user_id,
    { row, habit: prepareHabit({ login_propensity: row.login_propensity, density: decodeDensity(row.habit_matrix_data) }) },
  ]));
  const fallback = prepared.get(ORG_HABIT_ID)?.habit ?? null;

  // 3. The live race: spans from its points, priors from the backfilled paces, divisions.
  const raw = await listHorses(race.race_id);
  if (!raw.length) throw new Error('race has no horses');
  const livePoints = await pointsFor(race.race_id, raw);
  const horses = raw.map((h) => ({ ...withSpan(h, livePoints.get(h.horse_id) ?? []), prior_pace: priorFor(h.stable_horse_id) }));
  const divisionNames = await stampDivisions(race, horses);
  const divisionOf = new Map(horses.map((h) => [h.horse_id, h.division]));

  // 4. Org regulars who haven't joined, with the horse they raced most recently.
  const joinedUsers = new Set(horses.map((h) => h.user_id).filter(Boolean));
  const absent: Array<NotJoinedPlayer & { stable_horse_id: string }> = [];
  for (const { row, habit } of prepared.values()) {
    if (row.user_id === ORG_HABIT_ID || joinedUsers.has(row.user_id) || !row.stable_horse_id) continue;
    const sh = await getStableHorse(row.user_id, row.stable_horse_id);
    if (!sh) continue;
    absent.push({
      user_id: row.user_id, stable_horse_id: sh.stable_horse_id, habit, prior_pace: priorFor(sh.stable_horse_id),
      runner: { horse_id: `nj-${sh.stable_horse_id}`, name: sh.name, colors: sh.colors },
    });
  }
  const stampedAbsent = absent.map((p) => ({ stable_horse_id: p.stable_horse_id, division: undefined as number | undefined }));
  await stampDivisions(race, stampedAbsent);
  absent.forEach((p, i) => { const d = stampedAbsent[i]!.division; if (d !== undefined) p.runner.division = d; });

  // Roster at time t: horses that had joined by then are joined; the rest of the race, and
  // every absent regular, are offline players with their habits.
  const rosterAt = (t: number, joined: Horse[]): RaceRoster => {
    const inRace = new Set(joined.map((h) => h.horse_id));
    const later: NotJoinedPlayer[] = horses
      .filter((h) => !inRace.has(h.horse_id) && h.user_id && prepared.has(h.user_id))
      .map((h) => ({
        user_id: h.user_id!, habit: prepared.get(h.user_id!)!.habit, prior_pace: h.prior_pace,
        runner: { horse_id: h.horse_id, name: h.name, colors: h.colors, division: divisionOf.get(h.horse_id) },
      }));
    const habits = new Map<string, PreparedHabit>();
    for (const h of joined) if (h.user_id && prepared.has(h.user_id)) habits.set(h.user_id, prepared.get(h.user_id)!.habit);
    return { habits, fallback, notJoined: [...absent.map(({ stable_horse_id: _s, ...p }) => p), ...later] };
  };

  const snapshot = priceRaceNow(race, horses, nowMs, rosterAt(nowMs, horses));

  // 5. History every 5 minutes: rewind banked, spans and who had joined.
  const startMs = Date.parse(race.start_time);
  const step = HISTORY_INTERVAL_MIN * 60_000;
  const history: MarketSnapshot[] = [];
  for (let t = Math.ceil((startMs + MARKET_OPEN_MIN * 60_000) / step) * step; t <= nowMs; t += step) {
    const past = horses
      .filter((h) => Date.parse(h.joined_at) <= t)
      .map((h) => {
        const pts = livePoints.get(h.horse_id) ?? [];
        const after = pts.filter((p) => p.t > t).reduce((a, p) => a + p.d, 0);
        const ratio = h.current_tokens > 0 ? scoredOf(h) / h.current_tokens : 1;
        const rawThen = Math.max(0, h.current_tokens - after);
        return { ...withSpan(h, pts, t), current_tokens: rawThen, scored_tokens: rawThen * ratio };
      });
    history.push(priceRaceNow(race, past, t, rosterAt(t, past)));
  }

  const ranked = rankHorses(horses);
  const out = {
    generated_at: iso(nowMs),
    joinCode,
    raceName: race.name,
    runnerCount: horses.length,
    timeLeftSeconds: Math.max(0, Math.round((Date.parse(race.end_time) - nowMs) / 1000)),
    finished: false,
    divisionNames,
    horses: [
      ...ranked.map((h) => ({
        horse_id: h.horse_id, name: h.name, colors: h.colors, division: divisionOf.get(h.horse_id),
        jockey: h.user_name, banked: scoredOf(h), rank: h.rank, joined: true,
        prior_pace: Math.round(horses.find((x) => x.horse_id === h.horse_id)!.prior_pace),
      })),
      ...absent.map((p) => ({ ...p.runner, banked: 0, joined: false, prior_pace: Math.round(p.prior_pace) })),
    ],
    prices: snapshot.prices,
    history,
  };
  writeFileSync(OUT, JSON.stringify(out));

  const byUser = new Map(horses.map((h) => [h.user_id, h.name]));
  console.error(`${race.name} · ${horses.length} joined · ${absent.length} not joined · ` +
    `${recent.length} races in 14 days · ${stamped} spans recovered from points · ${history.length} history buckets`);
  console.error('\nhabits (turn-up rate, peak window, avg hours):');
  for (const { row } of prepared.values()) {
    const who = row.user_id === ORG_HABIT_ID ? 'ORG fallback'
      : byUser.get(row.user_id) ?? absent.find((p) => p.user_id === row.user_id)?.runner.name ?? row.user_id;
    console.error(`  ${who.padEnd(24)} ${row.login_propensity.toFixed(2)}  ${row.peak_activity_window.start}-${row.peak_activity_window.end}  ${row.avg_daily_race_hours.toFixed(1)}h  (${row.span_count} races)`);
  }
  console.error('\nprices (win / podium):');
  const nameOf = new Map(out.horses.map((h) => [h.horse_id, `${h.name}${h.joined ? '' : ' (not joined)'}`]));
  for (const p of [...snapshot.prices].sort((a, b) => b.win - a.win)) {
    console.error(`  ${(nameOf.get(p.horse_id) ?? p.horse_id).padEnd(36)} ${p.win.toFixed(3)}  ${p.podium.toFixed(3)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
