import { describe, it, expect, beforeEach } from 'vitest';
import { reconcileHorses, filterAndSortHorses } from '../src/render/reconcile.js';
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
    crashed: false,
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
    const lanes = track.querySelectorAll('.lane');
    expect(lanes).toHaveLength(2);
    expect(track.querySelectorAll('.horse')).toHaveLength(2);
  });

  it('assigns lanes by join order and keeps them stable across calls', () => {
    const r1 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
      horse('b', 200, 'Bravo', '2026-04-22T09:01:00Z'),
    ] });
    reconcileHorses(track, r1, new Date('2026-04-22T13:00:00Z'));

    const r2 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
      horse('b', 900, 'Bravo', '2026-04-22T09:01:00Z'),
    ] });
    reconcileHorses(track, r2, new Date('2026-04-22T13:00:00Z'));

    const lanes = track.querySelectorAll<HTMLDivElement>('.lane');
    expect(lanes).toHaveLength(2);
    expect(lanes[0]!.querySelector('.horse-label')?.textContent).toBe('Alpha');
    expect(lanes[1]!.querySelector('.horse-label')?.textContent).toBe('Bravo');
  });

  it('updates horse left% when tokens change', () => {
    const r = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    const h = track.querySelector<HTMLDivElement>('.horse')!;
    expect(h.style.left).toBe('50%');
  });

  it('adds the crashed class when horse.crashed flips true', () => {
    const r1 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r1, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelector('.horse')?.classList.contains('crashed')).toBe(false);

    const r2 = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z', { crashed: true }),
    ] });
    reconcileHorses(track, r2, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelector('.horse')?.classList.contains('crashed')).toBe(true);
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

  it('does not render a static .lane-name element (the horse-label tag replaces it)', () => {
    const r = race({ horses: [
      horse('a', 500, 'Alpha', '2026-04-22T09:00:00Z'),
    ] });
    reconcileHorses(track, r, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelector('.lane-name')).toBeNull();
    expect(track.querySelector('.horse-label')?.textContent).toBe('Alpha');
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

  it('moves crashed horses to bottom lanes', () => {
    const r1 = race({ horses: [
      horse('a', 100, 'Alpha', '2026-04-22T09:00:00Z'),
      horse('b', 200, 'Bravo', '2026-04-22T09:01:00Z'),
      horse('c', 300, 'Charlie', '2026-04-22T09:02:00Z'),
    ] });
    reconcileHorses(track, r1, new Date('2026-04-22T13:00:00Z'));

    const r2 = race({ horses: [
      horse('a', 100, 'Alpha', '2026-04-22T09:00:00Z', { crashed: true }),
      horse('b', 200, 'Bravo', '2026-04-22T09:01:00Z'),
      horse('c', 300, 'Charlie', '2026-04-22T09:02:00Z'),
    ] });
    reconcileHorses(track, r2, new Date('2026-04-22T13:00:00Z'));

    const lanes = Array.from(track.querySelectorAll<HTMLDivElement>('.lane'));
    const labels = lanes.map((l) => l.querySelector('.horse-label')?.textContent);
    expect(labels).toEqual(['Bravo', 'Charlie', 'Alpha']);
  });

  it('keeps the same DOM element when a horse crashes (does not destroy lane state)', () => {
    const r1 = race({ horses: [
      horse('a', 100, 'Alpha', '2026-04-22T09:00:00Z'),
      horse('b', 200, 'Bravo', '2026-04-22T09:01:00Z'),
    ] });
    reconcileHorses(track, r1, new Date('2026-04-22T13:00:00Z'));
    const alphaLane = track.querySelector('.lane[data-horse-id="a"]');

    const r2 = race({ horses: [
      horse('a', 100, 'Alpha', '2026-04-22T09:00:00Z', { crashed: true }),
      horse('b', 200, 'Bravo', '2026-04-22T09:01:00Z'),
    ] });
    reconcileHorses(track, r2, new Date('2026-04-22T13:00:00Z'));

    expect(track.querySelector('.lane[data-horse-id="a"]')).toBe(alphaLane);
  });

  it('removes a crashed horse when a live horse with the same name joins', () => {
    const r1 = race({ horses: [
      horse('a', 100, 'Alpha', '2026-04-22T09:00:00Z', { crashed: true }),
    ] });
    reconcileHorses(track, r1, new Date('2026-04-22T13:00:00Z'));
    expect(track.querySelectorAll('.lane')).toHaveLength(1);

    const r2 = race({ horses: [
      horse('a', 100, 'Alpha', '2026-04-22T09:00:00Z', { crashed: true }),
      horse('a2', 0, 'Alpha', '2026-04-22T12:55:00Z'),
    ] });
    reconcileHorses(track, r2, new Date('2026-04-22T13:00:00Z'));

    const lanes = Array.from(track.querySelectorAll<HTMLDivElement>('.lane'));
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.dataset.horseId).toBe('a2');
  });
});

describe('filterAndSortHorses', () => {
  function h(id: string, name: string, joined: string, crashed = false): HorseView {
    return {
      horse_id: id, name,
      colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
      current_tokens: 0,
      last_heartbeat: 'x',
      joined_at: joined,
      rank: 1,
      crashed,
    };
  }

  it('keeps original join order when nobody is crashed', () => {
    const out = filterAndSortHorses([
      h('a', 'Alpha', '2026-04-22T09:00:00Z'),
      h('b', 'Bravo', '2026-04-22T09:01:00Z'),
      h('c', 'Charlie', '2026-04-22T09:02:00Z'),
    ]);
    expect(out.map((x) => x.horse_id)).toEqual(['a', 'b', 'c']);
  });

  it('places crashed horses after non-crashed', () => {
    const out = filterAndSortHorses([
      h('a', 'Alpha', '2026-04-22T09:00:00Z', true),
      h('b', 'Bravo', '2026-04-22T09:01:00Z'),
      h('c', 'Charlie', '2026-04-22T09:02:00Z', true),
      h('d', 'Delta', '2026-04-22T09:03:00Z'),
    ]);
    expect(out.map((x) => x.horse_id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('drops a crashed horse when a live horse shares its name', () => {
    const out = filterAndSortHorses([
      h('old', 'Alpha', '2026-04-22T09:00:00Z', true),
      h('new', 'Alpha', '2026-04-22T09:10:00Z'),
    ]);
    expect(out.map((x) => x.horse_id)).toEqual(['new']);
  });

  it('keeps a crashed horse whose name is unique', () => {
    const out = filterAndSortHorses([
      h('a', 'Alpha', '2026-04-22T09:00:00Z', true),
      h('b', 'Bravo', '2026-04-22T09:01:00Z'),
    ]);
    expect(out.map((x) => x.horse_id)).toEqual(['b', 'a']);
  });
});
