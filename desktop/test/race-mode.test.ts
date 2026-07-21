import { describe, it, expect } from 'vitest';
import { raceStatusLabel } from '../src/screens/race-mode.js';
import type { ActiveRaceStatus } from '../electron/ipc.js';

function fakeStatus(overrides: Partial<ActiveRaceStatus> = {}): ActiveRaceStatus {
  return {
    joinCode: 'ABC123',
    raceName: 'Test Race',
    horseId: 'h-1',
    rank: 2,
    tokens: 1_200_000,
    status: 'live',
    stalled: false,
    ...overrides,
  };
}

describe('raceStatusLabel', () => {
  it('renders "P<rank> · <formatted tokens>" for a ranked horse', () => {
    expect(raceStatusLabel(fakeStatus({ rank: 2, tokens: 1_200_000 }))).toBe('P2 · 1.20M');
  });

  it('renders an em dash for the rank when unranked (e.g. a pending race)', () => {
    expect(raceStatusLabel(fakeStatus({ rank: null, tokens: 1_200_000 }))).toBe('— · 1.20M');
  });

  it('formats sub-1000 token counts as plain integers', () => {
    expect(raceStatusLabel(fakeStatus({ rank: 1, tokens: 500 }))).toBe('P1 · 500');
  });
});
