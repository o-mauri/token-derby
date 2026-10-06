import type { GetRaceResponse, HorseView, RaceHighlight, RaceSummary, SeasonStandings, StandingRow } from '@token-derby/shared';
import { scoredOf } from '@token-derby/shared';
import {
  type LeagueDivisionView, type LeaguePanelView, type LivePanelView, type SeasonLink, type LiveRow, type MonthLink, type OrgRunner, type RacesPanelView,
  type ResultRow, type StatsPanelView, type UpcomingRow, startsIn, NEUTRAL_HORSE,
} from '@token-derby/ui';

// Stands in for a horse whose colours the API didn't send.
const LOCALE = 'en-GB';
// Fixed short names: locales disagree ("Sep" vs "Sept"), and the design uses three letters.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

const byStart = (a: RaceSummary, b: RaceSummary) => Date.parse(a.start_time) - Date.parse(b.start_time);
const finished = (races: readonly RaceSummary[]) => races.filter((r) => r.status === 'finished').sort(byStart);
const pending = (races: readonly RaceSummary[]) => races.filter((r) => r.status === 'pending').sort(byStart);
/** The live race the org pages follow: the most recently started, if two overlap. */
export function currentLive(races: readonly RaceSummary[]): RaceSummary | undefined {
  return races.filter((r) => r.status === 'live').sort(byStart).at(-1);
}
const secondsUntil = (iso: string, nowMs: number) => Math.max(0, (Date.parse(iso) - nowMs) / 1000);

function highlightRunner(h: RaceHighlight): OrgRunner {
  return { id: h.horse_name, name: h.horse_name, owner: '', colors: h.colors, hat: h.hat ? { id: h.hat.id, variant: h.hat.variant } : null, tokens: h.tokens };
}

function horseRunner(h: HorseView): OrgRunner {
  return {
    id: h.horse_id, name: h.name, owner: h.user_name ?? '', colors: h.colors,
    hat: h.equipped_hat ? { id: h.equipped_hat.id, variant: h.equipped_hat.variant } : null, tokens: scoredOf(h),
  };
}

function resultRow(r: RaceSummary): ResultRow {
  return {
    code: r.join_code, name: r.name,
    date: shortDate(new Date(r.start_time)),
    winner: r.highlight ? highlightRunner(r.highlight) : null,
    tokens: r.highlight?.tokens ?? null, runners: r.runners ?? null, total: r.total_tokens ?? null,
  };
}

/** The LIVE panel: the live race (with its horses when loaded), else the next race, else none. */
export function livePanelView(races: readonly RaceSummary[], detail: GetRaceResponse | null, nowMs: number): LivePanelView {
  const live = currentLive(races);
  if (live) {
    const ranked = detail && detail.join_code === live.join_code ? [...detail.horses].sort((a, b) => scoredOf(b) - scoredOf(a)) : [];
    const lead = ranked[0];
    const start = Date.parse(live.start_time);
    const span = Date.parse(live.end_time) - start;
    return {
      kind: 'live', code: live.join_code, name: live.name,
      runners: detail && ranked.length ? ranked.length : live.runners ?? null,
      leader: lead ? { ...horseRunner(lead), pace: lead.pace_15m ?? null } : null,
      chasers: lead ? ranked.slice(1, 5).map((h, i) => ({ ...horseRunner(h), place: i + 2, gap: scoredOf(lead) - scoredOf(h) })) : [],
      anchor: { atMs: nowMs, timeLeftSeconds: detail?.time_left_seconds ?? live.time_left_seconds ?? secondsUntil(live.end_time, nowMs) },
      elapsedPct: span > 0 ? Math.round(Math.min(100, Math.max(0, ((nowMs - start) / span) * 100))) : 0,
    };
  }
  const next = pending(races)[0];
  if (next) {
    return { kind: 'next', code: next.join_code, name: next.name, startsAt: next.start_time, anchor: { atMs: nowMs, timeLeftSeconds: secondsUntil(next.start_time, nowMs) } };
  }
  return { kind: 'none' };
}

/** The STATS panel, from finished races only. A tie for most wins goes to whoever reached that count first. */
export function statsPanelView(races: readonly RaceSummary[]): StatsPanelView {
  const done = finished(races);
  const wins = new Map<string, number>();
  let best: { name: string; wins: number } | null = null;
  const latestLook = new Map<string, RaceHighlight>();
  for (const r of done) {
    if (!r.highlight) continue;
    const n = (wins.get(r.highlight.horse_name) ?? 0) + 1;
    wins.set(r.highlight.horse_name, n);
    latestLook.set(r.highlight.horse_name, r.highlight);
    if (!best || n > best.wins) best = { name: r.highlight.horse_name, wins: n };
  }
  const totals = done.map((r) => r.total_tokens ?? null);
  const known = totals.filter((t): t is number => t !== null);
  return {
    racesRun: done.length,
    mostWins: best ? { ...highlightRunner(latestLook.get(best.name)!), wins: best.wins } : null,
    totalTokens: known.length ? known.reduce((a, b) => a + b, 0) : null,
    lastTen: totals.slice(-10),
  };
}

/** The RACES panel: the next race and the three latest results. */
export function racesPanelView(races: readonly RaceSummary[], nowMs: number): RacesPanelView {
  const next = pending(races)[0];
  return {
    next: next ? { code: next.join_code, name: next.name, startsAt: next.start_time, anchor: { atMs: nowMs, timeLeftSeconds: secondsUntil(next.start_time, nowMs) } } : null,
    latest: finished(races).reverse().slice(0, 3).map(resultRow),
    count: races.length,
  };
}

function standingRunner(r: StandingRow): OrgRunner {
  return {
    id: r.stable_horse_id, name: r.horse_name, owner: r.user_name, colors: r.colors ?? NEUTRAL_HORSE,
    hat: r.hat ? { id: r.hat.id, variant: r.hat.variant } : null, tokens: r.season_tokens,
  };
}

/** The LEAGUE panel: up to three divisions, each led by its top horse. */
export function leaguePanelView(standings: SeasonStandings | null): LeaguePanelView {
  if (!standings) return null;
  return {
    season: standings.season, round: standings.round, total: standings.races_per_season,
    moreDivisions: Math.max(0, standings.divisions.length - 3),
    columns: standings.divisions.slice(0, 3).map((d) => {
      const [lead, ...rest] = d.rows;
      return {
        name: d.name,
        leader: lead ? { ...standingRunner(lead), points: lead.points } : null,
        rest: rest.map((r) => ({ ...standingRunner(r), place: r.rank, points: r.points })),
      };
    }),
  };
}

/** The viewer's local month a race started in, as YYYY-MM. */
export function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const monthDate = (key: string) => new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
const monthName = (key: string) => monthDate(key).toLocaleDateString(LOCALE, { month: 'long' });

export type MonthPage = { month: string; label: string; count: number; prev: MonthLink | null; next: MonthLink | null; rows: ResultRow[] };

/** One month of results, newest first; an unknown or empty month falls back to the latest with results. */
export function monthPage(races: readonly RaceSummary[], requested: string | null): MonthPage | null {
  const groups = new Map<string, RaceSummary[]>();
  for (const r of finished(races).reverse()) {
    const k = monthKey(r.start_time);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const months = [...groups.keys()].sort().reverse();
  if (!months.length) return null;
  const month = requested && groups.has(requested) ? requested : months[0]!;
  const i = months.indexOf(month);
  const year = month.slice(0, 4);
  const link = (key: string | undefined): MonthLink | null =>
    key ? { key, label: key.slice(0, 4) === year ? monthName(key) : `${monthName(key)} ${key.slice(0, 4)}` } : null;
  return {
    month, label: `${monthName(month).toUpperCase()} ${year}`, count: groups.get(month)!.length,
    prev: link(months[i + 1]), next: link(months[i - 1]), rows: groups.get(month)!.map(resultRow),
  };
}

/** Pending races, soonest first, with when they start. */
export function upcomingRows(races: readonly RaceSummary[], nowMs: number): UpcomingRow[] {
  return pending(races).map((r) => {
    const d = new Date(r.start_time);
    const seconds = secondsUntil(r.start_time, nowMs);
    return {
      code: r.join_code, name: r.name, startsAt: r.start_time,
      date: `${DAYS[d.getDay()]} ${shortDate(d)}`,
      time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      startsIn: startsIn(seconds), anchor: { atMs: nowMs, timeLeftSeconds: seconds },
    };
  });
}

/** The pinned row for the live race on the races page, from its summary. */
export function liveRow(races: readonly RaceSummary[], nowMs: number): LiveRow | null {
  const r = currentLive(races);
  if (!r) return null;
  return {
    code: r.join_code, name: r.name, leader: r.highlight ? highlightRunner(r.highlight) : null,
    tokens: r.highlight?.tokens ?? null, runners: r.runners ?? null,
    anchor: { atMs: nowMs, timeLeftSeconds: r.time_left_seconds ?? secondsUntil(r.end_time, nowMs) },
  };
}

/** The season named in ?season=, if it's a whole number from 1 to the current season; otherwise the current one. */
export function seasonToShow(requested: string | undefined, current: number): number {
  const n = Number(requested);
  return requested !== undefined && Number.isInteger(n) && n >= 1 && n <= current ? n : current;
}

export type LeaguePageView = {
  season: number; label: string;
  progress: { round: number; total: number } | null;
  champion: { name: string; owner: string; division: string } | null;
  prev: SeasonLink | null; next: SeasonLink | null;
  divisions: LeagueDivisionView[];
};

/** One season of a league: its divisions, the switcher either side, and progress (current) or champion (past). */
export function leaguePageView(standings: SeasonStandings, current: number): LeaguePageView {
  const season = standings.season;
  const past = season < current;
  const top = standings.divisions.find((d) => d.rows.length > 0);
  const lead = top?.rows[0];
  const link = (n: number): SeasonLink => ({ key: n, label: `Season ${n}` });
  return {
    season, label: `SEASON ${season}`,
    progress: past ? null : { round: standings.round, total: standings.races_per_season },
    champion: past && top && lead ? { name: lead.horse_name, owner: lead.user_name, division: top.name } : null,
    prev: season > 1 ? link(season - 1) : null,
    next: season < current ? link(season + 1) : null,
    divisions: standings.divisions.map((d) => ({
      name: d.name,
      rows: d.rows.map((r) => ({ ...standingRunner(r), place: r.rank, points: r.points, zone: r.zone })),
    })),
  };
}

