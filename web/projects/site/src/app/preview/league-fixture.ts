// League preview data for /preview-race?league, ported from the old site's preview-league.ts.
import type { GetRaceResponse, GetRaceSeriesResponse, HorseView, SeasonStandings, SeriesPoint } from '@token-derby/shared';
import { scoredOf } from '@token-derby/shared';
import { divisionResults } from '@token-derby/ui';
import type { PreviewRaceState } from './race-fixture';

const COLORS = [
  { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' },
  { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' },
  { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' },
  { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' },
  { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207' },
  { body: '#0E7490', mane: '#000000', tail: '#000000', saddle: '#F59E0B' },
  { body: '#9D174D', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#111827' },
];

const ORG_NAME = 'Anthropic';
const SEASON = 2;
const RACE_START_MS = Date.now() - 2 * 60 * 60 * 1000;
const RACE_END_MS = Date.now() + 6 * 60 * 60 * 1000;

// [name, user, division, tokens, xp awarded at the finish]
const FIXTURE: [string, string, number, number, number][] = [
  ['Comet', 'Alice', 1, 4820, 95],
  ['Bolt', 'Bob', 1, 4310, 70],
  ['Dash', 'Carol', 1, 3120, 48],
  ['Ada', 'Dan', 1, 1980, 30],
  ['Oak', 'Eve', 2, 4550, 88],
  ['Newbie', 'Frank', 2, 3400, 60], // not in standings yet, so a new entrant
  ['Fern', 'Grace', 2, 2600, 40],
  ['Gale', 'Heidi', 2, 900, 22],
];
// Extra runners for ?divisions=N (N > 2), spread over the lower divisions.
const EXTRA: [string, string, number, number][] = [
  ['Juniper', 'Ivan', 2750, 36], ['Maple', 'Judy', 2210, 30], ['Pepper', 'Ken', 1720, 28], ['Quill', 'Lin', 1400, 24],
  ['Rocket', 'Mo', 3900, 40], ['Saffron', 'Nia', 3010, 34], ['Tango', 'Oli', 650, 20],
];
const DIVISION_NAMES = ['Premier', 'Championship', 'League One', 'League Two', 'National'];

export type LeagueOptions = { divisions?: number; finale?: boolean };

function field(divisions: number): (typeof FIXTURE)[number][] {
  if (divisions <= 2) return FIXTURE;
  return [...FIXTURE, ...EXTRA.map(([n, u, t, xp], i): (typeof FIXTURE)[number] => [n, u, 3 + (i % (divisions - 2)), t, xp])];
}

function horse([name, user, division, tokens]: (typeof FIXTURE)[number], i: number): HorseView {
  const id = name.toLowerCase();
  return {
    horse_id: `horse-${id}`, stable_horse_id: `stable-${id}`, name, colors: COLORS[i % COLORS.length]!,
    current_tokens: tokens, last_heartbeat: new Date().toISOString(),
    joined_at: new Date(RACE_START_MS + i * 1000).toISOString(), rank: 0, user_id: `user-${id}`, user_name: user,
    xp: 100 + i * 40, division,
    recent_events: i === 0 ? [{ at: Date.now() - 5000, name: 'Took the lead!', xp: 5 }] : undefined,
  } as HorseView;
}

/** The league fixture in the given state; pending isn't offered, so it falls back to live. */
export function previewLeagueRace(state: PreviewRaceState, now = Date.now(), opts: LeagueOptions = {}): GetRaceResponse {
  const divisions = Math.min(5, Math.max(2, opts.divisions ?? 2));
  const ranked = field(divisions).map(horse).sort((a, b) => b.current_tokens - a.current_tokens).map((h, i) => ({ ...h, rank: i + 1 }));
  const race = {
    race_id: 'preview-league', name: `Anthropic League (League Race (${opts.finale ? 8 : 3}/8))`,
    start_time: new Date(RACE_START_MS).toISOString(), end_time: new Date(RACE_END_MS).toISOString(),
    tz: 'UTC', max_participants: 30, join_code: 'PRVRCE', created_at: new Date(RACE_START_MS - 3600_000).toISOString(),
    organisation_name: ORG_NAME, status: 'live', server_time: new Date(now).toISOString(),
    time_left_seconds: Math.max(0, Math.floor((RACE_END_MS - now) / 1000)), horses: ranked,
    league_id: 'org-anthropic', league_season: SEASON, league_round: opts.finale ? 8 : 3,
    league_division_names: DIVISION_NAMES.slice(0, divisions),
  } as GetRaceResponse;
  if (state !== 'finished') return race;
  const awarded = new Map(field(divisions).map(([name, , , , xp]) => [name, xp]));
  return {
    ...race, status: 'finished', time_left_seconds: 0,
    horses: race.horses.map((h) => ({ ...h, final_scored_tokens: scoredOf(h), xp_awarded: awarded.get(h.name) ?? 20 }) as HorseView),
  };
}

// Season points before this fixture. Newbie is deliberately absent from the Championship.
export const PREVIEW_STANDINGS: SeasonStandings = {
  org_name: ORG_NAME, season: SEASON, round: 3, races_per_season: 8,
  divisions: [
    { division: 1, name: 'Premier', rows: [
      { rank: 1, stable_horse_id: 'stable-bolt', horse_name: 'Bolt', user_name: 'Bob', points: 24, season_tokens: 90000, zone: null },
      { rank: 2, stable_horse_id: 'stable-ada', horse_name: 'Ada', user_name: 'Dan', points: 18, season_tokens: 72000, zone: null },
      { rank: 3, stable_horse_id: 'stable-comet', horse_name: 'Comet', user_name: 'Alice', points: 10, season_tokens: 60000, zone: null },
      { rank: 4, stable_horse_id: 'stable-dash', horse_name: 'Dash', user_name: 'Carol', points: 6, season_tokens: 40000, zone: 'relegate' },
    ] },
    { division: 2, name: 'Championship', rows: [
      { rank: 1, stable_horse_id: 'stable-oak', horse_name: 'Oak', user_name: 'Eve', points: 15, season_tokens: 55000, zone: 'promote' },
      { rank: 2, stable_horse_id: 'stable-fern', horse_name: 'Fern', user_name: 'Grace', points: 9, season_tokens: 41000, zone: null },
      { rank: 3, stable_horse_id: 'stable-gale', horse_name: 'Gale', user_name: 'Heidi', points: 4, season_tokens: 20000, zone: null },
    ] },
  ],
};

/** Standings for the preview: as before the race while it runs, and with its points added once it has finished. */
export function previewLeagueStandings(state: PreviewRaceState, opts: LeagueOptions = {}): SeasonStandings {
  const round = opts.finale ? 8 : 3;
  if (state !== 'finished' && (opts.divisions ?? 2) <= 2) return { ...PREVIEW_STANDINGS, round };
  const race = previewLeagueRace(state, Date.now(), opts);
  const before = new Map(PREVIEW_STANDINGS.divisions.flatMap((d) => d.rows).map((r) => [r.stable_horse_id, r]));
  const results = divisionResults(race.horses.map((h) => ({
    id: h.horse_id, stableId: h.stable_horse_id, name: h.name, owner: h.user_name ?? '', colors: h.colors, hat: null,
    tokens: h.final_scored_tokens ?? scoredOf(h), joinedAt: Date.parse(h.joined_at), division: h.division ?? -1,
  })), race.league_division_names ?? []);
  const scored = state === 'finished';
  return {
    org_name: ORG_NAME, season: SEASON, round, races_per_season: 8,
    divisions: results.map((d, di) => {
      const rows = d.rows
        .map((r, i) => {
          const prior = before.get(r.stableId) ?? (r.name === 'Newbie' ? undefined : { points: 9 - i, season_tokens: 30000 - i * 1000 });
          return {
            stable_horse_id: r.stableId, horse_name: r.name, user_name: r.owner,
            points: (prior?.points ?? 0) + (scored ? r.points : 0), season_tokens: (prior?.season_tokens ?? 0) + (scored ? r.tokens : 0),
          };
        })
        .sort((a, b) => b.points - a.points || b.season_tokens - a.season_tokens);
      return {
        division: d.division, name: d.name,
        rows: rows.map((r, i) => ({
          ...r, rank: i + 1,
          zone: di > 0 && i === 0 ? ('promote' as const) : di < results.length - 1 && i === rows.length - 1 ? ('relegate' as const) : null,
        })),
      };
    }),
  };
}

function seriesFor(h: HorseView, seed: number, nowMs: number): SeriesPoint[] {
  const minutes = Math.max(1, Math.floor((nowMs - RACE_START_MS) / 60_000));
  const weights = Array.from({ length: minutes }, (_, m) => {
    const active = Math.sin(m * 0.06 + seed * 1.7) > -0.25;
    return active ? Math.max(0, Math.sin(m * 0.4 + seed) * Math.cos(m * 0.13 + seed)) : 0;
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.flatMap((w, m) => (w > 0 ? [{ t: RACE_START_MS + m * 60_000 + 30_000, d: Math.round((w / sum) * h.current_tokens) }] : []));
}

const SERIES_NOW_MS = Date.now();
export const PREVIEW_LEAGUE_SERIES: GetRaceSeriesResponse = {
  start_ms: RACE_START_MS, end_ms: RACE_END_MS,
  horses: previewLeagueRace('live', SERIES_NOW_MS).horses.map((h, i) => ({ horse_id: h.horse_id, points: seriesFor(h, i, SERIES_NOW_MS) })),
};
