import { describe, it, expect } from 'vitest';
import { mapLeaderboard, resolveOrgName } from '../src/screens/org-leaderboard.js';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import type { GetOrgLeaderboardResponse, LeaderboardEntry, OrganisationSummary } from '@token-derby/shared';

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

// getOrgLeaderboard is called with an org NAME (the server resolves the path
// param via getOrganisationByName and rejects anything failing
// ORG_NAME_PATTERN — a randomUUID org_id always fails that pattern). These
// tests pin down that resolveOrgName picks org_name, not org_id, using a
// summary where the two are deliberately different shapes so a swap would
// be caught even by an == comparison mistake.
describe('resolveOrgName', () => {
  const orgs: OrganisationSummary[] = [
    { org_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', org_name: 'DerbyClub' },
    { org_id: '9c858901-8a57-4791-81fe-4c455b099bc9', org_name: 'StableMates' },
  ];

  it('resolves the org_name for the matching org_id, not the id itself', () => {
    const result = resolveOrgName(orgs, '3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(result).toBe('DerbyClub');
  });

  it('resolves a value that satisfies the server\'s ORG_NAME_PATTERN', () => {
    const result = resolveOrgName(orgs, '9c858901-8a57-4791-81fe-4c455b099bc9');
    expect(result).not.toBeNull();
    expect(ORG_NAME_PATTERN.test(result!)).toBe(true);
    // The id itself would never pass — this is exactly the bug being guarded against.
    expect(ORG_NAME_PATTERN.test('9c858901-8a57-4791-81fe-4c455b099bc9')).toBe(false);
  });

  it('returns null when orgId is null', () => {
    expect(resolveOrgName(orgs, null)).toBeNull();
  });

  it('returns null when no org matches the given id', () => {
    expect(resolveOrgName(orgs, 'no-such-id')).toBeNull();
  });
});
