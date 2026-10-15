import type { DivisionConfig, League, RaceSchedule, SetOrgLeagueRequest, SetOrgScheduleRequest } from '@token-derby/shared';
import { validateLeagueConfig } from '@token-derby/shared';

export type RacingMode = 'off' | 'schedule' | 'league';
export type ScheduleForm = {
  weekdays: number[]; start_local: string; end_local: string; tz: string; race_name: string; max_participants: number | null;
};
export type LeagueForm = ScheduleForm & { divisions: DivisionConfig[]; boundaries: number[]; races_per_season: number };

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const FALLBACK_TZ = 'Europe/London';

export function currentMode(schedule: RaceSchedule | null, league: League | null): RacingMode {
  return league ? 'league' : schedule ? 'schedule' : 'off';
}

export function scheduleFormFrom(s: RaceSchedule | null, browserTz: string): ScheduleForm {
  return {
    weekdays: s ? [...s.weekdays] : [1, 2, 3, 4, 5],
    start_local: s?.start_local ?? '09:00',
    end_local: s?.end_local ?? '17:30',
    tz: s?.tz ?? (browserTz || FALLBACK_TZ),
    race_name: s?.race_name ?? '',
    max_participants: s?.max_participants ?? null,
  };
}

/** A running league opens on the shape edits waiting for next season, so a reload doesn't lose them. */
export function leagueFormFrom(l: League | null, browserTz: string): LeagueForm {
  const pending = l?.pending_structural;
  return {
    ...scheduleFormFrom(l, browserTz),
    divisions: (pending?.divisions ?? l?.divisions ?? [
      { name: 'Premier', cap: 8 }, { name: 'Championship', cap: 8 }, { name: 'League One', cap: 8 },
    ]).map((d) => ({ ...d })),
    boundaries: [...(pending?.boundaries ?? l?.boundaries ?? [2, 2])],
    races_per_season: pending?.races_per_season ?? l?.races_per_season ?? 8,
  };
}

export function scheduleRequest(f: ScheduleForm): SetOrgScheduleRequest {
  return {
    weekdays: [...f.weekdays].sort((a, b) => a - b), start_local: f.start_local, end_local: f.end_local, tz: f.tz,
    ...(f.race_name.trim() ? { race_name: f.race_name.trim() } : {}),
    ...(f.max_participants !== null ? { max_participants: f.max_participants } : {}),
  };
}

export function leagueRequest(f: LeagueForm): SetOrgLeagueRequest {
  return {
    ...scheduleRequest(f),
    divisions: f.divisions.map((d) => ({ name: d.name.trim(), cap: d.cap })),
    boundaries: [...f.boundaries],
    races_per_season: f.races_per_season,
  };
}

export function scheduleError(f: ScheduleForm): string | null {
  if (!f.weekdays.length) return 'Pick at least one day.';
  if (!HHMM.test(f.start_local) || !HHMM.test(f.end_local)) return 'Race hours need a start and an end time.';
  if (f.end_local <= f.start_local) return 'Races must finish after they start.';
  if (f.max_participants !== null && (!Number.isInteger(f.max_participants) || f.max_participants < 1)) return 'Max runners must be at least 1.';
  return null;
}

/** The server's own rules, so the page and the API never disagree. */
export function leagueError(f: LeagueForm): string | null {
  const shared = validateLeagueConfig(leagueRequest(f));
  if (shared) return shared.charAt(0).toUpperCase() + shared.slice(1);
  return scheduleError(f);
}

export function scheduleSummary(f: ScheduleForm): string {
  const days = [...f.weekdays].sort((a, b) => a - b);
  const city = (f.tz.split('/').at(-1) ?? f.tz).replace(/_/g, ' ');
  return `${dayList(days)}, ${f.start_local}–${f.end_local} ${city} time.`;
}

function dayList(days: number[]): string {
  const names = days.map((d) => DAYS[d - 1]!);
  const run = days.length > 2 && days.every((d, i) => i === 0 || d === days[i - 1]! + 1);
  if (run) return `${names[0]} to ${names.at(-1)}`;
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The browser's time zones, its own first; a short list where the browser can't say. */
export function timeZones(browserTz: string): string[] {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [FALLBACK_TZ, 'UTC', 'America/New_York', 'Europe/Paris'];
  const first = browserTz || FALLBACK_TZ;
  return [first, ...all.filter((z) => z !== first)];
}
