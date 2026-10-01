import {
  priceRace, blendedPace, recentPacePrior, scoredOf, projectionTable, prepareHabit, decodeDensity,
  sampleAttendance, clockMinutes, localDate, DAY_MINUTES, MARKET_OPEN_MIN, FIELD_MEDIAN_PACE, SIMULATIONS,
  type MarketRunner, type MarketSnapshot, type NotJoinedRunner, type PreparedHabit, type SamplerPlayer,
  type Race, type Horse,
} from '@token-derby/shared';
import { getSnapshot, putSnapshot, appendHistory, HISTORY_INTERVAL_MIN, HISTORY_RETENTION_MS } from '../db/markets.js';
import { getHabitMatrices, ORG_HABIT_ID, type HabitSummary } from '../db/habits.js';
import { getStableHorse } from '../db/stable.js';
import { ensureHabits } from './fit-habits.js';
import { stampDivisions } from './divisions.js';

const OBSERVED_FLOOR_MIN = 30;

export type NotJoinedPlayer = { user_id: string; habit: PreparedHabit; runner: NotJoinedRunner; prior_pace: number };
export type RaceRoster = { habits: Map<string, PreparedHabit>; fallback: PreparedHabit | null; notJoined: NotJoinedPlayer[] };
export const EMPTY_ROSTER: RaceRoster = { habits: new Map(), fallback: null, notJoined: [] };

// Prepared habits survive between recomputes on a warm Lambda; keyed by fit time.
const prepared = new Map<string, PreparedHabit>();
let preparedCacheMax = 100;
let matrixFetches = 0;

export function setPreparedCacheMaxForTest(n: number): void {
  preparedCacheMax = n;
}

export function matrixFetchCount(): number {
  return matrixFetches;
}

// Rows from earlier fits are never pruned, so keep only the latest fit's summaries.
function latestFit(summaries: HabitSummary[]): HabitSummary[] {
  const org = summaries.find((s) => s.user_id === ORG_HABIT_ID);
  const stamp = org
    ? org.last_updated
    : summaries.reduce((max, s) => (s.last_updated > max ? s.last_updated : max), '');
  return summaries.filter((s) => s.last_updated === stamp);
}

async function preparedFor(org_id: string, summaries: HabitSummary[]): Promise<Map<string, PreparedHabit>> {
  const key = (s: HabitSummary) => `${org_id}:${s.user_id}:${s.last_updated}`;
  const out = new Map<string, PreparedHabit>();
  const missing: HabitSummary[] = [];
  for (const s of summaries) {
    const hit = prepared.get(key(s));
    if (hit) out.set(s.user_id, hit);
    else missing.push(s);
  }
  if (missing.length === 0) return out;
  matrixFetches++;
  const matrices = await getHabitMatrices(org_id, missing.map((s) => s.user_id));
  if (prepared.size + missing.length > preparedCacheMax) prepared.clear();
  for (const s of missing) {
    const m = matrices.get(s.user_id);
    if (!m) continue;
    const p = prepareHabit({ login_propensity: s.login_propensity, density: decodeDensity(m) });
    prepared.set(key(s), p);
    out.set(s.user_id, p);
  }
  return out;
}

export async function loadRoster(race: Race, horses: Horse[], nowMs: number): Promise<RaceRoster> {
  if (!race.org_id) return EMPTY_ROSTER;
  const summaries = latestFit(await ensureHabits(race.org_id, nowMs));
  if (summaries.length === 0) return EMPTY_ROSTER;
  const all = await preparedFor(race.org_id, summaries);
  const fallback = all.get(ORG_HABIT_ID) ?? null;
  const joinedUsers = new Set(horses.map((h) => h.user_id).filter(Boolean));

  const habits = new Map<string, PreparedHabit>();
  for (const [user, p] of all) if (user !== ORG_HABIT_ID && joinedUsers.has(user)) habits.set(user, p);

  const candidates = summaries.filter((s) => s.user_id !== ORG_HABIT_ID && !joinedUsers.has(s.user_id) && s.stable_horse_id && all.has(s.user_id));
  const stable = await Promise.all(candidates.map((s) => getStableHorse(s.user_id, s.stable_horse_id!)));
  const notJoined: Array<NotJoinedPlayer & { stable_horse_id: string }> = [];
  candidates.forEach((s, i) => {
    const sh = stable[i];
    if (!sh) return;
    notJoined.push({
      user_id: s.user_id,
      stable_horse_id: sh.stable_horse_id,
      habit: all.get(s.user_id)!,
      prior_pace: recentPacePrior(sh.recent_paces, FIELD_MEDIAN_PACE),
      runner: { horse_id: `nj-${sh.stable_horse_id}`, name: sh.name, colors: sh.colors },
    });
  });

  // Divisions come from standings, keyed by stable horse.
  const stamped = notJoined.map((p) => ({ stable_horse_id: p.stable_horse_id, division: undefined as number | undefined }));
  await stampDivisions(race, stamped);
  notJoined.forEach((p, i) => {
    const d = stamped[i]!.division;
    if (d !== undefined) p.runner.division = d;
  });

  return { habits, fallback, notJoined: notJoined.map(({ stable_horse_id: _s, ...p }) => p) };
}

function minutesBetween(a?: string, b?: string): number {
  if (!a || !b) return 0;
  return Math.max(0, (Date.parse(b) - Date.parse(a)) / 60_000);
}

export function priceRaceNow(race: Race, horses: Horse[], nowMs: number, roster: RaceRoster = EMPTY_ROSTER): MarketSnapshot {
  const bucket = Math.floor(nowMs / 60_000);
  // Price against the bucket, not the wall clock, so simultaneous readers agree.
  const atIso = new Date(bucket * 60_000).toISOString();

  const start = clockMinutes(race.start_time, race.tz);
  const sameDay = Date.parse(race.end_time) - Date.parse(race.start_time) < 86_400_000;
  const endClock = clockMinutes(race.end_time, race.tz);
  const finish = sameDay && endClock > start ? endClock : DAY_MINUTES;
  // Past local midnight the clock wraps; freeze at the finish rather than rewind.
  const wrapped = localDate(atIso, race.tz) !== localDate(race.start_time, race.tz);
  const now = wrapped ? finish : Math.min(finish, Math.max(start, clockMinutes(atIso, race.tz)));
  const maxMinutes = Math.max(0, finish - now);

  const totalRaw = horses.reduce((s, h) => s + h.current_tokens, 0);
  const raceRatio = totalRaw > 0 ? horses.reduce((s, h) => s + scoredOf(h), 0) / totalRaw : 1;

  const runners: MarketRunner[] = [];
  const players: SamplerPlayer[] = [];

  for (const h of horses) {
    const span = minutesBetween(h.first_scored_at, h.last_scored_at);
    const observed = h.first_scored_at ? h.current_tokens / Math.max(OBSERVED_FLOOR_MIN, span) : 0;
    const pace = blendedPace({ observed, prior: h.prior_pace ?? FIELD_MEDIAN_PACE, elapsedMin: span });
    runners.push({
      horse_id: h.horse_id, name: h.name, division: h.division, joined: true,
      seedKey: h.user_id ?? h.horse_id, banked: scoredOf(h), pace,
      projection: projectionTable({
        race, modifier_states: h.modifier_states ?? {}, model_tokens: h.model_tokens, pace, maxMinutes,
        fallbackRatio: h.current_tokens > 0 ? scoredOf(h) / h.current_tokens : raceRatio,
      }),
    });
    players.push({
      key: h.user_id ?? h.horse_id, kind: 'joined',
      arrival: clockMinutes(h.first_scored_at ?? h.joined_at, race.tz),
      lastScore: clockMinutes(h.last_scored_at ?? h.joined_at, race.tz),
      habit: (h.user_id && roster.habits.get(h.user_id)) || null,
    });
  }

  for (const p of roster.notJoined) {
    runners.push({
      horse_id: p.runner.horse_id, name: p.runner.name, division: p.runner.division, joined: false,
      seedKey: p.user_id, banked: 0, pace: p.prior_pace,
      projection: projectionTable({ race, modifier_states: {}, pace: p.prior_pace, maxMinutes, fallbackRatio: raceRatio }),
    });
    players.push({ key: p.user_id, kind: 'offline', habit: p.habit });
  }

  const attendance = sampleAttendance({
    race_id: race.race_id, replays: SIMULATIONS, now, finish, players, fallback: roster.fallback,
  });

  return {
    race_id: race.race_id,
    bucket,
    computed_at: atIso,
    prices: priceRace({ race_id: race.race_id, runners, attendance }),
    not_joined: roster.notJoined.map((p) => p.runner),
  };
}

// Markets open MARKET_OPEN_MIN after the off and close at the finish (the
// finish check is the caller's job, see get-markets.ts).
export async function ensureSnapshot(race: Race, horses: Horse[], nowMs: number): Promise<MarketSnapshot | null> {
  const startMs = new Date(race.start_time).getTime();
  if (nowMs < startMs + MARKET_OPEN_MIN * 60_000) return null;

  const bucket = Math.floor(nowMs / 60_000);
  const existing = await getSnapshot(race.race_id);
  if (existing && existing.bucket === bucket) return existing;

  let roster = EMPTY_ROSTER;
  try {
    roster = await loadRoster(race, horses, nowMs);
  } catch (error) {
    console.error('roster load failed', { race_id: race.race_id, error });
  }
  const snap = priceRaceNow(race, horses, nowMs, roster);
  await putSnapshot(snap);
  if (bucket % HISTORY_INTERVAL_MIN === 0) await appendHistory(snap, HISTORY_RETENTION_MS);
  return snap;
}
