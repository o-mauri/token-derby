// Standalone preview of the live race view with dummy data.
// Loaded by /preview-race.html — not part of the main app bundle.
import { renderRace } from './render/race.js';
import type { CollectedHat, GetRaceResponse, GetRaceSeriesResponse, HorseView, SeriesPoint } from '@token-derby/shared';

const COLORS_A = { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' };
const COLORS_B = { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' };
const COLORS_C = { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' };
const COLORS_D = { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' };
const COLORS_E = { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' };
const COLORS_F = { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207' };

const JOIN_CODE = 'PRVRCE';
const RACE_START_MS = Date.now() - 2 * 60 * 60 * 1000;   // started 2h ago
const RACE_END_MS   = Date.now() + 6 * 60 * 60 * 1000;   // ends in 6h

function horse(
  joinOrder: number,
  name: string,
  user_name: string,
  tokens: number,
  xp: number,
  colors: { body: string; mane: string; tail: string; saddle: string },
  equipped_hat?: CollectedHat,
): HorseView {
  const id = name.toLowerCase();
  return {
    horse_id: `horse-${id}`,
    stable_horse_id: `stable-${id}`,
    name,
    colors,
    current_tokens: tokens,
    last_heartbeat: new Date().toISOString(),
    joined_at: new Date(RACE_START_MS + joinOrder * 1000).toISOString(),
    rank: 0,
    user_id: `user-${id}`,
    user_name,
    xp,
    ...(equipped_hat ? { equipped_hat } : {}),
  };
}

const OBTAINED = new Date(RACE_START_MS - 24 * 60 * 60 * 1000).toISOString();

function snapshot(now: number): GetRaceResponse {
  const horses = [
    // Stormbringer in the lead, sporting a rainbow crown (animated legendary)
    horse(1, 'Stormbringer', 'Alice', 4280, 40,   COLORS_A,
      { id: 'rainbow_crown', obtained_at: OBTAINED }),
    // Pegasus chasing in a cowboy hat #1
    horse(2, 'Pegasus',      'Bob',   3915, 170,  COLORS_B,
      { id: 'cowboy_hat', variant: 0, obtained_at: OBTAINED }),
    // Cloudrunner in a sailor hat #1 (white + navy)
    horse(3, 'Cloudrunner',  'Carol', 3502, 300,  COLORS_C,
      { id: 'sailor_hat', variant: 0, obtained_at: OBTAINED }),
    // Thunderbolt: heavy hitter wearing a spartan helmet (epic, anchor extends forward)
    horse(4, 'Thunderbolt',  'Dan',   2880, 1000, COLORS_D,
      { id: 'spartan_helmet', variant: 0, obtained_at: OBTAINED }),
    // Embers: lit up with the inferno cap (animated legendary)
    horse(5, 'Embers',       'Eve',   1240, 655,  COLORS_E,
      { id: 'inferno_cap', obtained_at: OBTAINED }),
    // Misty: bareheaded — control case so you can compare with-hat vs without
    horse(6, 'Misty',        'Frank', 412,  10,   COLORS_F),
  ];
  const ranked: HorseView[] = horses
    .slice()
    .sort((a, b) => b.current_tokens - a.current_tokens)
    .map((h, i) => ({ ...h, rank: i + 1 }));

  return {
    race_id: 'preview-race',
    name: 'Preview Derby',
    start_time: new Date(RACE_START_MS).toISOString(),
    end_time: new Date(RACE_END_MS).toISOString(),
    tz: 'UTC',
    max_participants: 30,
    join_code: JOIN_CODE,
    organisation_name: 'Acme',
    created_at: new Date(RACE_START_MS - 60 * 60 * 1000).toISOString(),
    status: 'live',
    server_time: new Date(now).toISOString(),
    time_left_seconds: Math.max(0, Math.floor((RACE_END_MS - now) / 1000)),
    horses: ranked,
  };
}

// Dummy per-horse token series covering the elapsed part of the (live) race, so
// the mid-race graph popup has data without a real API. Live races clamp their
// chart window to "now", so points are only emitted up to this load time.
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
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (url.includes(`/api/races/${encodeURIComponent(JOIN_CODE)}`)) {
    return new Response(JSON.stringify(snapshot(Date.now())), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const app = document.getElementById('app')!;
renderRace(app, JOIN_CODE, { showGraphs: true });
