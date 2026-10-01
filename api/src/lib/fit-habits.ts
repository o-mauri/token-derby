// Fits every org player's attendance habits from the last 14 days of races.
import type { Horse, Race } from '@token-derby/shared';
import {
  fitHabits, fitOrgFallback, encodeDensity, clockMinutes, localDate, DAY_MINUTES, type Habit, type Span,
} from '@token-derby/shared';
import { listRacesByOrgId } from '../db/races.js';
import { listHorses } from '../db/horses.js';
import {
  putHabitRows, listHabitSummaries, claimHabitFit, ORG_HABIT_ID, type HabitRow, type HabitSummary,
} from '../db/habits.js';

export const HABIT_WINDOW_MS = 14 * 86_400_000;
export const FIT_CLAIM_STALE_MS = 120_000;

/** A horse's presence span in local clock minutes, clipped at midnight. */
export function spanOf(horse: Pick<Horse, 'first_scored_at' | 'last_scored_at'>, tz: string): Span | null {
  if (!horse.first_scored_at || !horse.last_scored_at) return null;
  const arrival = clockMinutes(horse.first_scored_at, tz);
  const sameDay = localDate(horse.first_scored_at, tz) === localDate(horse.last_scored_at, tz);
  const departure = sameDay ? Math.max(arrival, clockMinutes(horse.last_scored_at, tz)) : DAY_MINUTES;
  return { arrival, departure };
}

export function habitsAreFresh(summaries: HabitSummary[], races: Race[]): boolean {
  const latest = races.reduce((m, r) => (r.ended_at && r.ended_at > m ? r.ended_at : m), '');
  if (!latest) return true;
  const org = summaries.find((s) => s.user_id === ORG_HABIT_ID);
  return !!org && org.last_updated > latest;
}

function recentFinished(races: Race[], nowMs: number): Race[] {
  return races.filter((r) => r.ended_at && nowMs - Date.parse(r.ended_at) <= HABIT_WINDOW_MS);
}

export async function fitOrgHabits(org_id: string, nowMs: number): Promise<void> {
  const races = recentFinished(await listRacesByOrgId(org_id), nowMs);
  if (races.length === 0) return;
  const horsesByRace = new Map<string, Horse[]>();
  for (const race of races) horsesByRace.set(race.race_id, await listHorses(race.race_id));
  const rows = buildHabitRows(races, horsesByRace, nowMs);
  if (rows.length > 0) await putHabitRows(org_id, rows);
}

/** The habit rows a fit would write, from races already read. No I/O. */
export function buildHabitRows(races: Race[], horsesByRace: Map<string, Horse[]>, nowMs: number): HabitRow[] {
  const ordered = [...races].sort((a, b) => a.ended_at!.localeCompare(b.ended_at!));
  const byUser = new Map<string, { spans: Span[]; stable_horse_id?: string }>();
  let spanRaces = 0;
  for (const race of ordered) {
    const horses = horsesByRace.get(race.race_id) ?? [];
    let spansByHorse: Array<[Horse, Span | null]>;
    try {
      spansByHorse = horses.map((h) => [h, spanOf(h, race.tz)]);
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      console.warn('skipping race with invalid tz', { race_id: race.race_id });
      continue;
    }
    if (spansByHorse.some(([, span]) => span)) spanRaces++;
    for (const [h, span] of spansByHorse) {
      if (!h.user_id || !span) continue;
      const entry = byUser.get(h.user_id) ?? { spans: [] };
      entry.spans.push(span);
      // Races are oldest first, so the last write is the most recent horse.
      if (h.stable_horse_id) entry.stable_horse_id = h.stable_horse_id;
      byUser.set(h.user_id, entry);
    }
  }

  const last_updated = new Date(nowMs).toISOString();
  const rows: HabitRow[] = [];
  const propensities: number[] = [];
  const allSpans: Span[] = [];
  for (const [user_id, { spans, stable_horse_id }] of byUser) {
    const habit = fitHabits({ spans, orgRaceCount: spanRaces });
    if (!habit) continue;
    propensities.push(habit.login_propensity);
    allSpans.push(...spans);
    rows.push(toRow(user_id, habit, false, last_updated, stable_horse_id));
  }
  const fallback = fitOrgFallback({ allSpans, propensities });
  if (fallback) rows.push(toRow(ORG_HABIT_ID, fallback, true, last_updated));
  return rows;
}

function toRow(user_id: string, h: Habit, is_debutant: boolean, last_updated: string, stable_horse_id?: string): HabitRow {
  return {
    user_id, is_debutant, last_updated,
    login_propensity: h.login_propensity,
    avg_daily_race_hours: h.avg_daily_race_hours,
    peak_activity_window: h.peak_activity_window,
    hourly_probability_array: h.hourly_probability_array,
    span_count: h.span_count,
    habit_matrix_data: encodeDensity(h.density),
    ...(stable_horse_id ? { stable_horse_id } : {}),
  };
}

/** Current summaries, refitting first when a race has finished since the last fit. */
export async function ensureHabits(org_id: string, nowMs: number): Promise<HabitSummary[]> {
  const [summaries, races] = await Promise.all([listHabitSummaries(org_id), listRacesByOrgId(org_id)]);
  if (habitsAreFresh(summaries, recentFinished(races, nowMs))) return summaries;
  if (!(await claimHabitFit(org_id, nowMs, FIT_CLAIM_STALE_MS))) return summaries;
  try {
    await fitOrgHabits(org_id, nowMs);
  } catch (e) {
    console.error('habit fit failed', { org_id, error: e });
    return summaries;
  }
  return listHabitSummaries(org_id);
}
