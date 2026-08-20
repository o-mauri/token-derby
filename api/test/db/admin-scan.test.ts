import { describe, it, expect } from 'vitest';
import { putUser, updateUserDisplayName } from '../../src/db/users.js';
import { putStableHorse } from '../../src/db/stable.js';
import { putOrganisation, addMember } from '../../src/db/organisations.js';
import { scanUsersWithHorses, scanOrganisations } from '../../src/db/admin-scan.js';
import type { StableHorse } from '@token-derby/shared';

const uid = () => `u-${Math.random().toString(36).slice(2)}`;
const oid = () => `o-${Math.random().toString(36).slice(2)}`;

// Scan orders member rows by sk, i.e. by user_id. These force that pre-resolution
// order to be the reverse of the expected post-sort name order, so a sort that
// runs before names are filled in fails deterministically instead of by chance.
const uidLate = () => `u-zz-${Math.random().toString(36).slice(2)}`;
const uidEarly = () => `u-aa-${Math.random().toString(36).slice(2)}`;

function horse(name: string): StableHorse {
  return {
    stable_horse_id: `sh-${Math.random().toString(36).slice(2)}`,
    name,
    colors: { body: '#c0392b', mane: '#000', tail: '#000', saddle: '#fff' },
    created_at: '2026-04-01T00:00:00.000Z',
    xp: 100,
    races_entered: 3,
    wins: 1,
  };
}

describe('admin-scan', () => {
  it('groups users with their horses and strips the secret hash', async () => {
    const id = uid();
    await putUser({ user_id: id, display_name: 'ScanOmar', created_at: '2026-04-21T00:00:00.000Z' }, 'SECRET_HASH');
    await putStableHorse(id, horse('Thunderbolt'));
    await putStableHorse(id, horse('Blue Streak'));

    const users = await scanUsersWithHorses();
    const me = users.find(u => u.user_id === id);
    expect(me).toBeDefined();
    expect(me!.display_name).toBe('ScanOmar');
    expect(me!.horses.map(h => h.name).sort()).toEqual(['Blue Streak', 'Thunderbolt']);
    // secret never leaks
    expect(JSON.stringify(me)).not.toContain('SECRET_HASH');
    expect((me as any).secret_token_hash).toBeUndefined();
    // name-sentinel rows are not mistaken for horses
    expect(me!.horses.every(h => typeof h.stable_horse_id === 'string')).toBe(true);
  });

  it('returns a user with an empty horses array when they have none', async () => {
    const id = uid();
    await putUser({ user_id: id, display_name: 'Horseless', created_at: '2026-05-01T00:00:00.000Z' }, 'H');
    const users = await scanUsersWithHorses();
    expect(users.find(u => u.user_id === id)!.horses).toEqual([]);
  });

  it('groups organisations with their members, naming them from the user rows', async () => {
    const id = oid();
    const c1 = uidLate();
    const c2 = uidEarly();
    await putUser({ user_id: c1, display_name: 'Creator', created_at: '2026-04-22T00:00:00.000Z' }, 'H');
    await putUser({ user_id: c2, display_name: 'Member2', created_at: '2026-04-23T00:00:00.000Z' }, 'H');
    await putOrganisation(
      { org_id: id, org_name: `Org${id.slice(2, 6)}`, created_at: '2026-04-22T00:00:00.000Z', creator_user_id: c1, creator_user_name: 'Creator' },
      'JOIN_TOKEN_SECRET',
    );
    await addMember(id, c1, '2026-04-22T00:00:00.000Z');
    await addMember(id, c2, '2026-04-23T00:00:00.000Z');

    const orgs = await scanOrganisations();
    const org = orgs.find(o => o.org_id === id);
    expect(org).toBeDefined();
    expect(org!.creator_user_name).toBe('Creator');
    expect(org!.members.map(m => m.user_name)).toEqual(['Creator', 'Member2']);
    // join token never leaks
    expect(JSON.stringify(org)).not.toContain('JOIN_TOKEN_SECRET');
  });

  it('reflects renames of both the creator and a member', async () => {
    const id = oid();
    const c1 = uidLate();
    const c2 = uidEarly();
    await putUser({ user_id: c1, display_name: 'Zeta', created_at: '2026-04-22T00:00:00.000Z' }, 'H');
    await putUser({ user_id: c2, display_name: 'Alpha', created_at: '2026-04-23T00:00:00.000Z' }, 'H');
    await putOrganisation(
      { org_id: id, org_name: `Ren${id.slice(2, 6)}`, created_at: '2026-04-22T00:00:00.000Z', creator_user_id: c1, creator_user_name: 'Zeta' },
      'JT',
    );
    await addMember(id, c1, '2026-04-22T00:00:00.000Z');
    await addMember(id, c2, '2026-04-23T00:00:00.000Z');

    await updateUserDisplayName(c1, 'Aaron');
    await updateUserDisplayName(c2, 'Zach');

    const org = (await scanOrganisations()).find(o => o.org_id === id)!;
    expect(org.creator_user_name).toBe('Aaron');
    // sorted by the *current* name, so the rename reorders them
    expect(org.members.map(m => m.user_name)).toEqual(['Aaron', 'Zach']);
  });
});
