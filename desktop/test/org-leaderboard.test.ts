import { describe, it, expect } from 'vitest';
import { mapLeaderboard } from '../src/screens/org-leaderboard.js';
import type { GetOrgLeaderboardResponse, LeaderboardEntry } from '@token-derby/shared';

function fakeEntry(overrides: Partial<LeaderboardEntry> & { name: string; owner_name: string; xp: number }): LeaderboardEntry {
  return {
    wins: 0,
    podiums: 0,
    races_entered: 0,
    ...overrides,
  };
}

function fakeResp(horses: LeaderboardEntry[]): GetOrgLeaderboardResponse {
  return { org_name: 'Test Org', horses };
}

describe('mapLeaderboard', () => {
  it('sorts rows by xp descending', () => {
    const resp = fakeResp([
      fakeEntry({ name: 'Low XP', owner_name: 'Alice', xp: 100 }),
      fakeEntry({ name: 'High XP', owner_name: 'Bob', xp: 900 }),
      fakeEntry({ name: 'Mid XP', owner_name: 'Carol', xp: 500 }),
    ]);

    const result = mapLeaderboard(resp);

    expect(result.map((r) => r.name)).toEqual(['High XP', 'Mid XP', 'Low XP']);
  });

  it('exposes name, owner_name, wins, podiums, and xp per row', () => {
    const resp = fakeResp([
      fakeEntry({ name: 'Only Horse', owner_name: 'Dana', wins: 3, podiums: 6, xp: 250, races_entered: 12 }),
    ]);

    const result = mapLeaderboard(resp);

    expect(result).toEqual([
      { name: 'Only Horse', owner_name: 'Dana', wins: 3, podiums: 6, xp: 250 },
    ]);
  });

  it('does not mutate the response horses array', () => {
    const horses = [
      fakeEntry({ name: 'A', owner_name: 'X', xp: 1 }),
      fakeEntry({ name: 'B', owner_name: 'Y', xp: 2 }),
    ];
    const resp = fakeResp(horses);

    mapLeaderboard(resp);

    expect(horses.map((h) => h.name)).toEqual(['A', 'B']);
  });

  it('returns an empty list for an org with no leaderboard entries', () => {
    expect(mapLeaderboard(fakeResp([]))).toEqual([]);
  });
});
