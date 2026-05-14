import { describe, it, expect } from 'vitest';
import { elapsedPct, leaderTokens, horseXPct } from '../src/position.js';
import type { HorseView } from '@token-derby/shared';

const start = '2026-04-22T09:00:00Z';
const end = '2026-04-22T17:00:00Z';

function h(current_tokens: number, extras: Partial<HorseView> = {}): HorseView {
  return {
    horse_id: 'h',
    stable_horse_id: 'sh',
    name: 'x',
    colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
    current_tokens,
    last_heartbeat: start,
    joined_at: start,
    rank: 1,
    user_id: 'user-1',
    user_name: 'User',
    ...extras,
  };
}

describe('elapsedPct', () => {
  it('returns 0 before start', () => {
    expect(elapsedPct(start, end, new Date('2026-04-22T08:00:00Z'))).toBe(0);
  });

  it('returns 0.5 at midpoint', () => {
    expect(elapsedPct(start, end, new Date('2026-04-22T13:00:00Z'))).toBe(0.5);
  });

  it('returns 1 at end', () => {
    expect(elapsedPct(start, end, new Date('2026-04-22T17:00:00Z'))).toBe(1);
  });

  it('clamps to 1 after end', () => {
    expect(elapsedPct(start, end, new Date('2026-04-23T00:00:00Z'))).toBe(1);
  });

  it('returns 0 when end_time <= start_time', () => {
    expect(elapsedPct(end, start, new Date('2026-04-22T13:00:00Z'))).toBe(0);
  });
});

describe('leaderTokens', () => {
  it('returns the max current_tokens across horses', () => {
    expect(leaderTokens([h(100), h(500), h(200)])).toBe(500);
  });

  it('returns 1 when all horses are at 0', () => {
    expect(leaderTokens([h(0), h(0)])).toBe(1);
  });

  it('returns 1 for an empty list', () => {
    expect(leaderTokens([])).toBe(1);
  });
});

describe('horseXPct', () => {
  const horses = [h(1000), h(500)];

  it('leader sits at exactly elapsed_pct × 100%', () => {
    expect(horseXPct(horses[0]!, horses, 0.5)).toBe(50);
  });

  it('trailing horse is proportional to leader', () => {
    expect(horseXPct(horses[1]!, horses, 0.5)).toBe(25);
  });

  it('horse with 0 tokens stays at 0%', () => {
    expect(horseXPct(h(0), [h(0), h(1000)], 0.5)).toBe(0);
  });

  it('at elapsed_pct=0 everyone is at 0%', () => {
    expect(horseXPct(horses[0]!, horses, 0)).toBe(0);
  });

  it('at elapsed_pct=1 leader is at 100%', () => {
    expect(horseXPct(horses[0]!, horses, 1)).toBe(100);
  });
});
