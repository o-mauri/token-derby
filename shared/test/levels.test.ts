import { describe, it, expect } from 'vitest';
import { leagueXpMultiplier, LEAGUE_XP_GATE } from '../src/levels.js';

describe('leagueXpMultiplier', () => {
  it('is full at >=3 distinct horses, half at 2, zero at <=1', () => {
    expect(leagueXpMultiplier(5)).toBe(1);
    expect(leagueXpMultiplier(3)).toBe(1);
    expect(leagueXpMultiplier(2)).toBe(0.5);
    expect(leagueXpMultiplier(1)).toBe(0);
    expect(leagueXpMultiplier(0)).toBe(0);
  });
  it('exposes the thresholds', () => {
    expect(LEAGUE_XP_GATE).toEqual({ full_horses: 3, half_horses: 2 });
  });
});
