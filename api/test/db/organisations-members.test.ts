import { describe, it, expect } from 'vitest';
import { putOrganisation, addMember, listOrgMembers } from '../../src/db/organisations.js';

describe('listOrgMembers', () => {
  it('returns each member with their user_id and user_name', async () => {
    const org_id = `org-members-${Date.now()}`;
    await putOrganisation(
      {
        org_id,
        org_name: `Members${Date.now()}`,
        created_at: new Date().toISOString(),
        creator_user_id: 'u-creator',
        creator_user_name: 'Creator',
      },
      'join-token-x',
    );
    await addMember(org_id, 'u-creator', 'Creator', new Date().toISOString());
    await addMember(org_id, 'u-bob', 'Bob', new Date().toISOString());

    const members = await listOrgMembers(org_id);
    const byId = Object.fromEntries(members.map(m => [m.user_id, m.user_name]));
    expect(byId['u-creator']).toBe('Creator');
    expect(byId['u-bob']).toBe('Bob');
    expect(members).toHaveLength(2);
  });

  it('returns an empty array for an org with no members', async () => {
    const members = await listOrgMembers(`org-empty-${Date.now()}`);
    expect(members).toEqual([]);
  });
});
