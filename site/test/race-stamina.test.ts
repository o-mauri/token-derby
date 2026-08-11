import { describe, it, expect, vi } from 'vitest';
import type { RaceView, HorseView } from '@token-derby/shared';

const fetchRace = vi.fn<() => Promise<RaceView>>();
vi.mock('../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../src/api.js')>('../src/api.js');
  return { ...actual, fetchRace: () => fetchRace() };
});

import { renderRace } from '../src/render/race.js';

function horse(over: Partial<HorseView>): HorseView {
  return {
    horse_id: 'h1', stable_horse_id: 's1', name: 'Dobbin',
    colors: { body: '#c96', mane: '#333', tail: '#333', saddle: '#a22' },
    current_tokens: 10_000, scored_tokens: 10_000,
    last_heartbeat: '2026-08-04T10:00:00.000Z', joined_at: '2026-08-04T09:00:00.000Z',
    user_id: 'u1', user_name: 'Omar', xp: 0, rank: 1,
    ...over,
  };
}

function view(h: Partial<HorseView>, race: Partial<RaceView> = {}): RaceView {
  return {
    race_id: 'r1', name: 'Race', join_code: 'AAAAAA',
    start_time: '2026-08-04T09:00:00.000Z', end_time: '2026-08-04T21:00:00.000Z',
    tz: 'Europe/London', max_participants: 30, created_at: '2026-08-04T08:00:00.000Z',
    status: 'live', server_time: '2026-08-04T10:00:00.000Z', time_left_seconds: 39_600,
    stamina: true, horses: [horse(h)],
    ...race,
  };
}

async function mount(v: RaceView): Promise<HTMLElement> {
  fetchRace.mockResolvedValue(v);
  const root = document.createElement('div');
  document.body.append(root);
  renderRace(root, 'AAAAAA');
  // .race-header exists synchronously before the poll's first fetch resolves,
  // so it never actually waits; .horse only appears once reconcileHorses runs.
  await vi.waitFor(() => expect(root.querySelector('.horse')).not.toBeNull());
  return root;
}

describe('race page stamina rendering', () => {
  it('bands the stamina bar green above 50', async () => {
    const root = await mount(view({ stamina: 80 }));
    expect(root.querySelector('.stamina-bar')!.getAttribute('data-band')).toBe('green');
  });

  it('bands amber between the taper floor and 50', async () => {
    const root = await mount(view({ stamina: 30 }));
    expect(root.querySelector('.stamina-bar')!.getAttribute('data-band')).toBe('amber');
  });

  it('bands red below the taper floor', async () => {
    const root = await mount(view({ stamina: 12.5 }));
    const bar = root.querySelector('.stamina-bar')!;
    expect(bar.getAttribute('data-band')).toBe('red');
  });

  it('mounts the bar inside the .horse element so it tracks the sprite', async () => {
    const root = await mount(view({ stamina: 60 }));
    const bar = root.querySelector('.stamina-bar')!;
    expect(bar.closest('.horse')).not.toBeNull();
  });

  it('displays the scored token count, not the raw one', async () => {
    const root = await mount(view({ current_tokens: 10_000, scored_tokens: 8_000, stamina: 20 }));
    expect(root.querySelector('.horse-tokens')!.textContent).toContain('8,000');
    expect(root.querySelector('.horse-tokens')!.textContent).not.toContain('10,000');
  });

  it('renders no stamina bar when the race has stamina off', async () => {
    const root = await mount(view({ stamina: undefined }, { stamina: false }));
    expect(root.querySelector('.stamina-bar')).toBeNull();
  });

  it('uses the race\'s own snapshotted taper floor, not the STAMINA default', async () => {
    // Org tuned taper_floor to 40 for this race. Stamina 30 sits below that
    // floor (already tired, server-side), even though it's above the
    // default floor of 25 — the bar must agree with the server, not the default.
    const root = await mount(view({ stamina: 30 }, { stamina_config: { taper_floor: 40 } }));
    expect(root.querySelector('.stamina-bar')!.getAttribute('data-band')).toBe('red');
  });
});
