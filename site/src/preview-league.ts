// Standalone preview of the live LEAGUE race view with dummy data + standings.
// Loaded by /preview-league.html — not part of the main app bundle. Exercises the
// projected league-standings section in the ticker (order → standings → achievements).
import { renderRace } from './render/race.js';
import type { GetRaceResponse, GetRaceSeriesResponse, HorseView, SeasonStandings, SeriesPoint } from '@token-derby/shared';

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

const JOIN_CODE = 'PRVLGE';
const ORG_NAME = 'Anthropic';
const SEASON = 2;
const RACE_START_MS = Date.now() - 2 * 60 * 60 * 1000;
const RACE_END_MS = Date.now() + 6 * 60 * 60 * 1000;

// [name, user, division, live tokens] — live order within a division drives the
// projected points (1st +20, 2nd +15, 3rd +12, 4th +10).
const FIXTURE: Array<[string, string, number, number]> = [
  ['Comet', 'Alice', 1, 4820],
  ['Bolt', 'Bob', 1, 4310],
  ['Dash', 'Carol', 1, 3120],
  ['Ada', 'Dan', 1, 1980],
  ['Oak', 'Eve', 2, 4550],
  ['Newbie', 'Frank', 2, 3400], // not in standings yet → synthetic 0 pts
  ['Fern', 'Grace', 2, 2600],
  ['Gale', 'Heidi', 2, 900],
];

function horse([name, user, division, tokens]: [string, string, number, number], i: number): HorseView {
  const id = name.toLowerCase();
  return {
    horse_id: `horse-${id}`,
    stable_horse_id: `stable-${id}`,
    name,
    colors: COLORS[i % COLORS.length]!,
    current_tokens: tokens,
    last_heartbeat: new Date().toISOString(),
    joined_at: new Date(RACE_START_MS + i * 1000).toISOString(),
    rank: 0,
    user_id: `user-${id}`,
    user_name: user,
    xp: 100 + i * 40,
    division,
    recent_events: i === 0
      ? [{ at: Date.now() - 5000, name: 'Took the lead!', xp: 5 }]
      : undefined,
  } as HorseView;
}

function snapshot(now: number): GetRaceResponse {
  const ranked = FIXTURE.map(horse)
    .sort((a, b) => b.current_tokens - a.current_tokens)
    .map((h, i) => ({ ...h, rank: i + 1 }));
  return {
    race_id: 'preview-league',
    name: 'Anthropic League (League Race (3/8))',
    start_time: new Date(RACE_START_MS).toISOString(),
    end_time: new Date(RACE_END_MS).toISOString(),
    tz: 'UTC',
    max_participants: 30,
    join_code: JOIN_CODE,
    created_at: new Date(RACE_START_MS - 60 * 60 * 1000).toISOString(),
    organisation_name: ORG_NAME,
    status: 'live',
    server_time: new Date(now).toISOString(),
    time_left_seconds: Math.max(0, Math.floor((RACE_END_MS - now) / 1000)),
    horses: ranked,
    league_id: 'org-anthropic',
    league_season: SEASON,
    league_round: 3,
    league_division_names: ['Premier', 'Championship'],
  } as GetRaceResponse;
}

// Pre-race season points. Newbie deliberately absent from Championship (new entrant).
const STANDINGS: SeasonStandings = {
  org_name: ORG_NAME,
  season: SEASON,
  round: 3,
  races_per_season: 8,
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

// Dummy per-horse token series covering the elapsed part of the (live) race, so
// the mid-race graph popup has data without a real API. Live races clamp their
// chart window to "now", so points are only emitted up to this load time. Every
// horse (both divisions) gets points so filtering to either division shows data.
const SERIES_NOW_MS = Date.now();

function seriesFor(h: HorseView, seed: number): SeriesPoint[] {
  const elapsedMinutes = Math.max(1, Math.floor((SERIES_NOW_MS - RACE_START_MS) / 60_000));
  const weights = Array.from({ length: elapsedMinutes }, (_, m) => {
    const active = Math.sin(m * 0.06 + seed * 1.7) > -0.25;
    const burst = Math.max(0, Math.sin(m * 0.4 + seed) * Math.cos(m * 0.13 + seed));
    return active ? burst : 0;
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const total = h.current_tokens;
  const points: SeriesPoint[] = [];
  weights.forEach((w, m) => {
    if (w <= 0) return; // idle minute — no point recorded
    points.push({ t: RACE_START_MS + m * 60_000 + 30_000, d: Math.round((w / sum) * total) });
  });
  return points;
}

const SERIES: GetRaceSeriesResponse = {
  start_ms: RACE_START_MS,
  end_ms: RACE_END_MS,
  horses: snapshot(SERIES_NOW_MS).horses.map((h, i) => ({ horse_id: h.horse_id, points: seriesFor(h, i) })),
};

window.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes(`/api/races/${encodeURIComponent(JOIN_CODE)}/series`)) {
    return new Response(JSON.stringify(SERIES), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }
  if (url.includes(`/api/races/${encodeURIComponent(JOIN_CODE)}`)) {
    return new Response(JSON.stringify(snapshot(Date.now())), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }
  if (url.includes(`/api/organisations/${encodeURIComponent(ORG_NAME)}/league/standings`)) {
    return new Response(JSON.stringify({ standings: STANDINGS }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const app = document.getElementById('app')!;
renderRace(app, JOIN_CODE, { showGraphs: true });
