import { describe, it, expect } from 'vitest';
import { raceStatusLabel, canRace } from '../src/screens/race-mode.js';
import type { ActiveRaceStatus } from '../electron/ipc.js';
import type { Standing } from '../src/screens/race-standings.js';
import type { HorseColors } from '@token-derby/shared';

const COLORS: HorseColors = { body: '#8B4513', mane: '#f5e9d3', tail: '#f5e9d3', saddle: '#3d2856' };

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

function fakeStanding(overrides: Partial<Standing> & { horse_id: string }): Standing {
  return {
    rank: 1,
    name: 'Horse',
    tokens: 0,
    colors: COLORS,
    isYou: false,
    isLeader: false,
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

describe('canRace', () => {
  it('is true when there is no active race', () => {
    expect(canRace([], null)).toBe(true);
  });

  it('is true when the active race\'s horse is not among these standings (a different race is being viewed)', () => {
    const standings = [fakeStanding({ horse_id: 'h-other' })];
    expect(canRace(standings, fakeStatus({ horseId: 'h-1' }))).toBe(true);
  });

  it('is false when the active race\'s horse IS among these standings (viewing the race you are racing)', () => {
    const standings = [fakeStanding({ horse_id: 'h-1' }), fakeStanding({ horse_id: 'h-other' })];
    expect(canRace(standings, fakeStatus({ horseId: 'h-1' }))).toBe(false);
  });
});
