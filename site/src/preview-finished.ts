// Standalone preview of the post-race overlay with dummy data.
// Loaded by /preview.html — not part of the main app bundle.
import { renderFinishedOverlay } from './render/finished.js';
import type { GetRaceResponse, GetRaceSeriesResponse, HorseView, SeriesPoint } from '@token-derby/shared';

const COLORS_A = { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' };
const COLORS_B = { body: '#FFFFFF', mane: '#000000', tail: '#000000', saddle: '#1B4F72' };
const COLORS_C = { body: '#CD853F', mane: '#FFD700', tail: '#FFD700', saddle: '#196F3D' };
const COLORS_D = { body: '#4A235A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#EAB308' };
const COLORS_E = { body: '#1E40AF', mane: '#000000', tail: '#000000', saddle: '#DC2626' };
const COLORS_F = { body: '#16A34A', mane: '#FFFFFF', tail: '#FFFFFF', saddle: '#A16207' };

function horse(
  rank: number,
  name: string,
  user_name: string,
  tokens: number,
  xpBefore: number,
  xpAwarded: number,
  colors = COLORS_A,
): HorseView {
  const id = name.toLowerCase();
  return {
    horse_id: `horse-${id}`,
    stable_horse_id: `stable-${id}`,
    name,
    colors,
    current_tokens: tokens,
    last_heartbeat: '2026-04-22T16:59:00Z',
    joined_at: `2026-04-22T09:00:0${rank}Z`,
    final_tokens: tokens,
    rank,
    user_id: `user-${id}`,
    user_name,
    xp: xpBefore,
    xp_awarded: xpAwarded,
  };
}

// Six horses across the full range of "what could happen":
//   1st  Stormbringer (Alice)  — wins, levels up (40 → 135, lvl 1→2). +95 = 80 position + 15 winner bonus.
//   2nd  Pegasus (Bob)         — runner-up, levels up (170 → 249, lvl 2→3). +79 = 65 + 14 token bonus.
//   3rd  Cloudrunner (Carol)   — podium, no level up (300 → 362, lvl 3). +62 = 50 + 12 token bonus.
//   4th  Thunderbolt (Dan)     — also-ran, no level up (1000 → 1035, lvl 5). +35 = 25 + 10 token bonus.
//   5th  Embers (Eve)          — also-ran, levels up (655 → 684, lvl 4→5). +29 = 25 + 4 token bonus.
//   6th  Misty (Frank)         — also-ran, no level up (10 → 36, lvl 1). +26 = 25 + 1 token bonus.
const race: GetRaceResponse = {
  race_id: 'preview-race',
  name: 'Preview Derby',
  start_time: '2026-04-22T09:00:00Z',
  end_time: '2026-04-22T17:00:00Z',
  tz: 'UTC',
  max_participants: 30,
  join_code: 'PREVIEW',
  created_at: '2026-04-22T08:00:00Z',
  ended_at: '2026-04-22T17:00:00Z',
  status: 'finished',
  server_time: '2026-04-22T17:00:00Z',
  time_left_seconds: 0,
  horses: [
    horse(1, 'Stormbringer', 'Alice', 4280, 40,   95, COLORS_A),
    horse(2, 'Pegasus',      'Bob',   3915, 170,  79, COLORS_B),
    horse(3, 'Cloudrunner',  'Carol', 3502, 300,  62, COLORS_C),
    horse(4, 'Thunderbolt',  'Dan',   2880, 1000, 35, COLORS_D),
    horse(5, 'Embers',       'Eve',   1240, 655,  29, COLORS_E),
    horse(6, 'Misty',        'Frank', 412,  10,   26, COLORS_F),
    // Ranks 7–15 — a fuller field so the charts/standings show a larger race.
    ...[
      { name: 'Comet',   user: 'Grace',    tokens: 380, body: '#FF4D4D' },
      { name: 'Blaze',   user: 'Heidi',    tokens: 345, body: '#FF9F1C' },
      { name: 'Shadow',  user: 'Ivan',     tokens: 310, body: '#FFD23F' },
      { name: 'Dash',    user: 'Judy',     tokens: 278, body: '#2EC4B6' },
      { name: 'Nova',    user: 'Mallory',  tokens: 248, body: '#00A8E8' },
      { name: 'Rocket',  user: 'Niaj',     tokens: 210, body: '#C77DFF' },
      { name: 'Ziggy',   user: 'Olivia',   tokens: 170, body: '#FF66C4' },
      { name: 'Tornado', user: 'Peggy',    tokens: 120, body: '#9EF01A' },
      { name: 'Bandit',  user: 'Quentin',  tokens: 70,  body: '#C0C0C0' },
    ].map((h, i) =>
      horse(7 + i, h.name, h.user, h.tokens, 100 + i * 40, 22,
        { body: h.body, mane: '#000000', tail: '#000000', saddle: '#333333' })),
  ],
};

// Dummy per-horse token series spanning the race window, so the rotating
// chart panel (cumulative + tokens/min) has data without a live API. Points are
// emitted roughly once a minute with idle gaps (no point) to exercise the
// client-side 1-minute tick resampling: cumulative carries flat through idle
// stretches and pace drops to 0.
const START = Date.parse(race.start_time);
const END = Date.parse(race.end_time);
const MINUTES = Math.max(1, Math.round((END - START) / 60_000));

function seriesFor(h: HorseView, seed: number): SeriesPoint[] {
  // Per-minute activity weight; a slow wave gates whole stretches to idle (0).
  const weights = Array.from({ length: MINUTES }, (_, m) => {
    const active = Math.sin(m * 0.06 + seed * 1.7) > -0.25;
    const burst = Math.max(0, Math.sin(m * 0.4 + seed) * Math.cos(m * 0.13 + seed));
    return active ? burst : 0;
  });
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const total = h.final_tokens ?? h.current_tokens;
  const points: SeriesPoint[] = [];
  weights.forEach((w, m) => {
    if (w <= 0) return; // idle minute — no point recorded
    points.push({ t: START + m * 60_000 + 30_000, d: Math.round((w / sum) * total) });
  });
  return points;
}

const series: GetRaceSeriesResponse = {
  start_ms: START,
  end_ms: END,
  horses: race.horses.map((h, i) => ({ horse_id: h.horse_id, points: seriesFor(h, i) })),
};

const app = document.getElementById('app')!;
app.classList.add('race');

const heading = document.createElement('div');
heading.className = 'preview-header';
heading.innerHTML = `
  <h1 style="margin:0 0 6px 0">Token Derby — End of Race preview</h1>
  <p style="margin:0;color:var(--muted);font-size:0.9em">
    Dummy race rendered to show the post-race overlay. The panel below the podium
    auto-crossfades through standings → cumulative tokens → tokens/min. Click
    <strong>Reload</strong> to replay the bar animation.
  </p>
  <button id="reload" type="button" style="margin-top:8px;padding:6px 14px;cursor:pointer">Reload</button>
`;
app.appendChild(heading);

let teardown: (() => void) | null = null;

function show(): void {
  // Tear down any prior overlay's cycler/timer, then strip old overlay/confetti.
  teardown?.();
  app.querySelectorAll('.podium, .confetti').forEach(el => el.remove());
  app.classList.remove('finished');
  teardown = renderFinishedOverlay(app, race, { fetchSeries: async () => series });
}

document.getElementById('reload')!.addEventListener('click', show);
show();
