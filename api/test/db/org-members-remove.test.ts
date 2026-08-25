import { describe, it, expect } from 'vitest';
import {
  putOrganisation, addMember, isMember, listOrgMembers,
  removeMember,
} from '../../src/db/organisations.js';
import { ensureStanding, listSeasonStandings } from '../../src/db/league-standings.js';
import type { LeagueStanding } from '@token-derby/shared';

const uid = () => `u-rm-${Math.random().toString(36).slice(2)}`;

async function seedOrg(members: string[]) {
  const org_id = `org-rm-${Math.random().toString(36).slice(2)}`;
  await putOrganisation(
    {
      org_id,
      org_name: `Rm${Math.random().toString(36).slice(2, 8)}`,
      created_at: new Date().toISOString(),
      creator_user_id: members[0]!,
      creator_user_name: 'Creator',
    },
    `join-token-${org_id}`,
  );
  for (const m of members) {
    await addMember(org_id, m, new Date().toISOString());
  }
  return org_id;
}

function standingFor(org_id: string, user_id: string): LeagueStanding {
  return {
    org_id,
    season: 1,
    division: 1,
    stable_horse_id: `sh-${user_id}`,
    horse_name: 'Old Glory',
    user_id,
    user_name: 'Someone',
    points: 42,
    season_tokens: 7,
    entered_at: new Date().toISOString(),
  };
}

describe('removeMember', () => {
  it('drops isMember to false and removes the row from listOrgMembers', async () => {
    const bob = uid();
    const org_id = await seedOrg([bob]);

    expect(await isMember(org_id, bob)).toBe(true);

    const removed = await removeMember(org_id, bob);
    expect(removed).toBe(true);

    expect(await isMember(org_id, bob)).toBe(false);
    expect((await listOrgMembers(org_id)).some(m => m.user_id === bob)).toBe(false);
  });

  it('returns false and does not throw for a non-member', async () => {
    const org_id = await seedOrg([uid()]);
    await expect(removeMember(org_id, uid())).resolves.toBe(false);
  });

  it('leaves the removed member\'s existing league standings intact', async () => {
    const bob = uid();
    const org_id = await seedOrg([bob]);
    const standing = standingFor(org_id, bob);
    await ensureStanding(standing);

    await removeMember(org_id, bob);

    const standings = await listSeasonStandings(org_id, 1);
    const bobStanding = standings.find(s => s.stable_horse_id === standing.stable_horse_id);
    expect(bobStanding).toBeDefined();
    expect(bobStanding!.points).toBe(42);
    expect(bobStanding!.season_tokens).toBe(7);
  });

  it('does not affect another member of the same org', async () => {
    const bob = uid();
    const alice = uid();
    const org_id = await seedOrg([bob, alice]);

    await removeMember(org_id, bob);

    // Assert the OTHER member's row survives, not merely that removal
    // returned true — a hard delete that over-deletes would still "succeed".
    expect(await isMember(org_id, alice)).toBe(true);
    expect((await listOrgMembers(org_id)).some(m => m.user_id === alice)).toBe(true);
  });

  it('does not affect the same user\'s membership of a different org', async () => {
    const bob = uid();
    const org_a = await seedOrg([bob]);
    const org_b = await seedOrg([bob]);

    await removeMember(org_a, bob);

    expect(await isMember(org_a, bob)).toBe(false);
    // The load-bearing assertion: bob's membership row in org_b survives.
    expect(await isMember(org_b, bob)).toBe(true);
    expect((await listOrgMembers(org_b)).some(m => m.user_id === bob)).toBe(true);
  });
});
