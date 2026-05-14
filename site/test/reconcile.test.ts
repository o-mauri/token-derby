import { describe, it, expect, beforeEach } from 'vitest';
import { reconcileHorses, sortHorses } from '../src/render/reconcile.js';
import type { GetRaceResponse, HorseView } from '@token-derby/shared';

function race(overrides: Partial<GetRaceResponse> = {}): GetRaceResponse {
  return {
    race_id: 'r1', name: 'X',
    start_time: '2026-04-22T09:00:00Z',
    end_time: '2026-04-22T17:00:00Z',
    tz: 'UTC', max_participants: 30, join_code: 'JC1234',
    created_at: 'c',
    status: 'live',
    horses: [],
    server_time: '2026-04-22T13:00:00Z',
    time_left_seconds: 14_400,
    ...overrides,
  };
}

function horse(id: string, tokens: number, name: string, joined: string, extras: Partial<HorseView> = {}): HorseView {
  return {
    horse_id: id,
    name,
    colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
    current_tokens: tokens,
    last_heartbeat: '2026-04-22T12:59:00Z',
    joined_at: joined,
    rank: 1,
    user_id: `user-${id}`,
    user_name: `User ${id.toUpperCase()}`,
    ...extras,
  };
}

let track: HTMLDivElement;
beforeEach(() => {
  document.body.innerHTML = '';
  track = document.createElement('div');
  track.className = 'track';
  document.body.appendChild(track);
});

describe('reconcileHorses', () => {
  it('creates one lane per horse on first call', () => {
    const r = race({
      horses: [
        horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
        horse('b', 200, 'Bravo', '2026-04-22T09:01:00Z'),
      ],
    });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelectorAll('.lane')).toHaveLength(2);
  });

  it('updates horse left% when tokens change', () => {
    const r = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    const h = track.querySelector<HTMLDivElement>('.horse')!;
    expect(h.style.left).toBe('50%');
  });

  it('adds new horses that joined between polls without tearing existing ones', () => {
    const r1 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r1, new Date('2026-04-22T13:00:00Z'));
    const alphaFirst = track.querySelector('.horse[data-horse-id="a"]');
    expect(alphaFirst).toBeTruthy();

    const r2 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
      horse('b', 200, 'Bravo', '2026-04-22T12:58:00Z'),
    ] });
    reconcileHorses(track, r2, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelectorAll('.lane')).toHaveLength(2);
    expect(track.querySelector('.horse[data-horse-id="a"]')).toBe(alphaFirst);
  });

  it('renders the horse name as a .horse-label tag', () => {
    const r = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelector('.lane-name')).toBeNull();
    expect(track.querySelector('.horse-label')?.textContent).toBe('Alpha');
  });

  it('renders the user_name in a .user-label under the horse name', () => {
    const r = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z', { user_name: 'Alice' }),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelector('.user-label')?.textContent).toBe('(Alice)');
  });

  it('omits the .user-label when user_name is missing (legacy horses)', () => {
    const r = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z', { user_name: '' as any }),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelector('.user-label')).toBeNull();
  });

  it('applies horse colors as CSS custom properties', () => {
    const r = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    const h = track.querySelector<HTMLDivElement>('.horse')!;
    expect(h.style.getPropertyValue('--body')).toBe('#8B4513');
    expect(h.style.getPropertyValue('--saddle')).toBe('#C0392B');
  });

  it('renders token count formatted with thousands separator', () => {
    const r = race({ horses: [
      horse('a', 12_847, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelector('.horse-tokens')?.textContent).toBe('12,847 tok');
  });

  it('renders pace as em-dash when null or absent in map', () => {
    const r = race({ horses: [
      horse('a', 100, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelector('.horse-pace')?.textContent).toBe('—');
  });

  it('renders pace value when provided', () => {
    const r = race({ horses: [
      horse('a', 100, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    const paces = new Map<string, number | null>([['a', 247]]);
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'), paces);
    expect(track.querySelector('.horse-pace')?.textContent).toBe('+247/min');
  });

  it('updates token count and pace across calls without re-creating the lane', () => {
    const r1 = race({ horses: [horse('a', 100, 'Alpha', '2026-04-22T09:00:00Z')] });
    reconcileHorses(track, r1, new Date('2026-04-22T13:00:00Z'), new Map([['a', null]]));
    const laneFirst = track.querySelector('.lane');

    const r2 = race({ horses: [horse('a', 2_500, 'Alpha', '2026-04-22T09:00:00Z')] });
    reconcileHorses(track, r2, new Date('2026-04-22T13:00:00Z'), new Map([['a', 1_234]]));

    expect(track.querySelector('.lane')).toBe(laneFirst);
    expect(track.querySelector('.horse-tokens')?.textContent).toBe('2,500 tok');
    expect(track.querySelector('.horse-pace')?.textContent).toBe('+1,234/min');
  });

  it('does not add a .crashed CSS class even when heartbeats are stale', () => {
    const r = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z', { last_heartbeat: '2026-04-22T08:00:00Z' }),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelector('.horse')?.classList.contains('crashed')).toBe(false);
  });
});

describe('sortHorses', () => {
  function h(id: string, joined: string): HorseView {
    return {
      horse_id: id, name: id,
      colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
      current_tokens: 0,
      last_heartbeat: 'x',
      joined_at: joined,
      rank: 1,
      user_id: `u-${id}`,
      user_name: `User ${id}`,
    };
  }

  it('keeps join order', () => {
    const out = sortHorses([
      h('a', '2026-04-22T09:00:00Z'),
      h('b', '2026-04-22T09:01:00Z'),
      h('c', '2026-04-22T09:02:00Z'),
    ]);
    expect(out.map((x) => x.horse_id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts unsorted input by joined_at', () => {
    const out = sortHorses([
      h('c', '2026-04-22T09:02:00Z'),
      h('a', '2026-04-22T09:00:00Z'),
      h('b', '2026-04-22T09:01:00Z'),
    ]);
    expect(out.map((x) => x.horse_id)).toEqual(['a', 'b', 'c']);
  });
});
