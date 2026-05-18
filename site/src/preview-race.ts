// Standalone preview of the live race view with dummy data.
// Loaded by /preview-race.html — not part of the main app bundle.
import { renderRace } from './render/race.js';
import type { GetRaceResponse, HorseView } from '@token-derby/shared';

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
  };
}

function snapshot(now: number): GetRaceResponse {
  const horses = [
    horse(1, 'Stormbringer', 'Alice', 4280, 40,   COLORS_A),
    horse(2, 'Pegasus',      'Bob',   3915, 170,  COLORS_B),
    horse(3, 'Cloudrunner',  'Carol', 3502, 300,  COLORS_C),
    horse(4, 'Thunderbolt',  'Dan',   2880, 1000, COLORS_D),
    horse(5, 'Embers',       'Eve',   1240, 655,  COLORS_E),
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
    created_at: new Date(RACE_START_MS - 60 * 60 * 1000).toISOString(),
    status: 'live',
    server_time: new Date(now).toISOString(),
    time_left_seconds: Math.max(0, Math.floor((RACE_END_MS - now) / 1000)),
    horses: ranked,
  };
}

window.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes(`/api/races/${encodeURIComponent(JOIN_CODE)}`)) {
    return new Response(JSON.stringify(snapshot(Date.now())), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const app = document.getElementById('app')!;
renderRace(app, JOIN_CODE);
