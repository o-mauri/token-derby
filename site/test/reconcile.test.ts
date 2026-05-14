import { describe, it, expect, beforeEach } from 'vitest';
import { reconcileHorses } from '../src/render/reconcile.js';
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
});
