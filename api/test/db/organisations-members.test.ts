import { describe, it, expect } from 'vitest';
import { putOrganisation, addMember, listOrgMembers } from '../../src/db/organisations.js';
import { putUser, updateUserDisplayName } from '../../src/db/users.js';

const uid = () => `u-mem-${Math.random().toString(36).slice(2)}`;

async function seedOrg(members: { id: string; name: string }[]) {
  const org_id = `org-members-${Math.random().toString(36).slice(2)}`;
  const creator = members[0]!;
  await putOrganisation(
    {
      org_id,
      org_name: `Mem${Math.random().toString(36).slice(2, 8)}`,
      created_at: new Date().toISOString(),
      creator_user_id: creator.id,
      creator_user_name: creator.name,
    },
    `join-token-${org_id}`,
  );
  for (const m of members) {
    await putUser({ user_id: m.id, display_name: m.name, created_at: new Date().toISOString() }, 'H');
    await addMember(org_id, m.id, new Date().toISOString());
  }
  return org_id;
}

describe('listOrgMembers', () => {
  it('returns each member with their user_id and current display name', async () => {
    const creator = uid();
    const bob = uid();
    const org_id = await seedOrg([{ id: creator, name: 'Creator' }, { id: bob, name: 'Bob' }]);

    const members = await listOrgMembers(org_id);
    const byId = Object.fromEntries(members.map(m => [m.user_id, m.user_name]));
    expect(byId[creator]).toBe('Creator');
    expect(byId[bob]).toBe('Bob');
    expect(members).toHaveLength(2);
    expect(members.every(m => typeof m.joined_at === 'string' && m.joined_at !== '')).toBe(true);
  });

  it('reflects a rename immediately, with no propagation', async () => {
    const bob = uid();
    const org_id = await seedOrg([{ id: bob, name: 'Bob' }]);

    await updateUserDisplayName(bob, 'Robert');

    const members = await listOrgMembers(org_id);
    expect(members[0]!.user_name).toBe('Robert');
  });

  it('returns an empty name for a member with no user row', async () => {
    const org_id = `org-ghost-${Math.random().toString(36).slice(2)}`;
    await putOrganisation(
      {
        org_id, org_name: `Ghost${Math.random().toString(36).slice(2, 8)}`,
        created_at: new Date().toISOString(),
        creator_user_id: 'u-ghost', creator_user_name: 'Ghost',
      },
      `join-token-${org_id}`,
    );
    await addMember(org_id, 'u-ghost', new Date().toISOString());

    const members = await listOrgMembers(org_id);
    expect(members).toHaveLength(1);
    expect(members[0]!.user_id).toBe('u-ghost');
    expect(members[0]!.user_name).toBe('');
  });

  it('returns an empty array for an org with no members', async () => {
    expect(await listOrgMembers(`org-empty-${Date.now()}`)).toEqual([]);
  });
});
