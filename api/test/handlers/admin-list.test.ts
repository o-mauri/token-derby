import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { signSession } from '../../src/lib/admin-auth.js';
import { putUser } from '../../src/db/users.js';
import { putStableHorse } from '../../src/db/stable.js';
import { putOrganisation, addMember } from '../../src/db/organisations.js';
import type { StableHorse } from '@token-derby/shared';

const SECRET = 'list-test-secret';
vi.mock('../../src/lib/admin-config.js', () => ({
  loadAdminConfig: vi.fn(async () => ({ username: 'omar', passwordHash: 'x:y', sessionSecret: SECRET })),
}));

import { handler as listUsers } from '../../src/handlers/admin-list-users.js';
import { handler as listOrgs } from '../../src/handlers/admin-list-organisations.js';

const nowSec = () => Math.floor(Date.now() / 1000);
const goodToken = () => signSession(SECRET, { sub: 'admin', exp: nowSec() + 60 });

function ev(token?: string): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (token) headers['authorization'] = `Bearer ${token}`;
  return { headers } as unknown as APIGatewayProxyEventV2;
}

function horse(name: string): StableHorse {
  return {
    stable_horse_id: `sh-${Math.random().toString(36).slice(2)}`,
    name, colors: { body: '#c0392b', mane: '#000', tail: '#000', saddle: '#fff' },
    created_at: '2026-04-01T00:00:00.000Z', xp: 50,
  };
}

describe('admin list handlers', () => {
  it('list-users rejects a missing token with 401', async () => {
    const res: any = await listUsers(ev() as any);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
  });

  it('list-users returns grouped users with a valid token', async () => {
    const id = `u-${Math.random().toString(36).slice(2)}`;
    await putUser({ user_id: id, display_name: 'ListOmar', created_at: '2026-04-21T00:00:00.000Z' }, 'H');
    await putStableHorse(id, horse('Thunderbolt'));

    const res: any = await listUsers(ev(goodToken()) as any);
    expect(res.statusCode).toBe(200);
    const me = JSON.parse(res.body).users.find((u: any) => u.user_id === id);
    expect(me.horses[0].name).toBe('Thunderbolt');
  });

  it('list-organisations rejects a missing token with 401', async () => {
    const res: any = await listOrgs(ev() as any);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
  });

  it('list-organisations returns grouped orgs with members for a valid token', async () => {
    const oid = `o-${Math.random().toString(36).slice(2)}`;
    await putOrganisation(
      { org_id: oid, org_name: `O${oid.slice(2, 6)}`, created_at: '2026-04-22T00:00:00.000Z', creator_user_id: 'c1', creator_user_name: 'Creator' },
      'JT',
    );
    await addMember(oid, 'c1', 'Creator', '2026-04-22T00:00:00.000Z');

    const res: any = await listOrgs(ev(goodToken()) as any);
    expect(res.statusCode).toBe(200);
    const org = JSON.parse(res.body).organisations.find((o: any) => o.org_id === oid);
    expect(org.members[0].user_name).toBe('Creator');
  });
});
