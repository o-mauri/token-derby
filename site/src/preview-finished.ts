// Standalone preview of the post-race overlay with dummy data.
// Loaded by /preview.html — not part of the main app bundle.
import { renderFinishedOverlay } from './render/finished.js';
import type { GetRaceResponse, HorseView } from '@token-derby/shared';

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
  ],
};

const app = document.getElementById('app')!;
app.classList.add('race');

const heading = document.createElement('div');
heading.className = 'preview-header';
heading.innerHTML = `
  <h1 style="margin:0 0 6px 0">Token Derby — End of Race preview</h1>
  <p style="margin:0;color:var(--muted);font-size:0.9em">
    Dummy race rendered to show the post-race overlay. Click <strong>Reload</strong> to replay the bar animation.
  </p>
  <button id="reload" type="button" style="margin-top:8px;padding:6px 14px;cursor:pointer">Reload</button>
`;
app.appendChild(heading);

function show(): void {
  // Strip any old overlay/confetti so we can replay the animation.
  app.querySelectorAll('.podium, .confetti').forEach(el => el.remove());
  app.classList.remove('finished');
  renderFinishedOverlay(app, race);
}

document.getElementById('reload')!.addEventListener('click', show);
show();
