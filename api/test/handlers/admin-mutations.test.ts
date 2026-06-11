import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { signSession } from '../../src/lib/admin-auth.js';
import { putUser, getUserById } from '../../src/db/users.js';
import { putStableHorse, getStableHorse, equipHat } from '../../src/db/stable.js';
import type { StableHorse } from '@token-derby/shared';

const SECRET = 'mutations-secret';
vi.mock('../../src/lib/admin-config.js', () => ({
  loadAdminConfig: vi.fn(async () => ({ username: 'omar', passwordHash: 'x:y', sessionSecret: SECRET })),
}));

import { handler as renameUser } from '../../src/handlers/admin-rename-user.js';
import { handler as renameHorse } from '../../src/handlers/admin-rename-horse.js';
import { handler as removeHat } from '../../src/handlers/admin-remove-hat.js';
import { handler as deleteHorse } from '../../src/handlers/admin-delete-horse.js';

const token = () => signSession(SECRET, { sub: 'admin', exp: Math.floor(Date.now() / 1000) + 60 });

function ev(opts: { params?: Record<string, string>; body?: unknown; token?: string }): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
  return {
    headers,
    pathParameters: opts.params ?? {},
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  } as unknown as APIGatewayProxyEventV2;
}

const uid = () => `u-${Math.random().toString(36).slice(2)}`;
function horse(name: string): StableHorse {
  return {
    stable_horse_id: `sh-${Math.random().toString(36).slice(2)}`,
    name, colors: { body: '#c0392b', mane: '#000', tail: '#000', saddle: '#fff' },
    created_at: '2026-04-01T00:00:00.000Z', xp: 0,
    hats: [
      { id: 'flat_cap', variant: 0, obtained_at: '2026-04-02T00:00:00.000Z' },
      { id: 'beanie', variant: 0, obtained_at: '2026-04-03T00:00:00.000Z' },
    ],
  };
}

describe('admin mutation handlers', () => {
  it('all four reject a missing token with 401', async () => {
    for (const h of [renameUser, renameHorse, removeHat, deleteHorse]) {
      const res: any = await h(ev({ params: { user_id: 'u', stable_horse_id: 's', index: '0' } }) as any);
      expect(res.statusCode).toBe(401);
    }
  });

  it('renames a user (200) and 404s an unknown one', async () => {
    const id = uid();
    await putUser({ user_id: id, display_name: 'Old', created_at: '2026-04-21T00:00:00.000Z' }, 'H');
    const res: any = await renameUser(ev({ params: { user_id: id }, body: { display_name: 'NewName' }, token: token() }) as any);
    expect(res.statusCode).toBe(200);
    expect((await getUserById(id))!.display_name).toBe('NewName');

    const miss: any = await renameUser(ev({ params: { user_id: uid() }, body: { display_name: 'X' }, token: token() }) as any);
    expect(miss.statusCode).toBe(404);
    expect(JSON.parse(miss.body).code).toBe('USER_NOT_FOUND');
  });

  it('rejects an over-long jockey name with 400', async () => {
    const id = uid();
    await putUser({ user_id: id, display_name: 'Old', created_at: '2026-04-21T00:00:00.000Z' }, 'H');
    const res: any = await renameUser(ev({ params: { user_id: id }, body: { display_name: 'x'.repeat(41) }, token: token() }) as any);
    expect(res.statusCode).toBe(400);
  });

  it('renames a horse (200), 404s unknown, 409s a duplicate name', async () => {
    const id = uid();
    await putUser({ user_id: id, display_name: 'J', created_at: '2026-04-21T00:00:00.000Z' }, 'H');
    const a = horse('Alpha'); const b = horse('Bravo');
    await putStableHorse(id, a); await putStableHorse(id, b);

    const okRes: any = await renameHorse(ev({ params: { user_id: id, stable_horse_id: a.stable_horse_id }, body: { name: 'Renamed' }, token: token() }) as any);
    expect(okRes.statusCode).toBe(200);
    expect((await getStableHorse(id, a.stable_horse_id))!.name).toBe('Renamed');

    const miss: any = await renameHorse(ev({ params: { user_id: id, stable_horse_id: 'sh-nope' }, body: { name: 'Z' }, token: token() }) as any);
    expect(miss.statusCode).toBe(404);

    const dup: any = await renameHorse(ev({ params: { user_id: id, stable_horse_id: a.stable_horse_id }, body: { name: 'Bravo' }, token: token() }) as any);
    expect(dup.statusCode).toBe(409);
    expect(JSON.parse(dup.body).code).toBe('STABLE_HORSE_NAME_TAKEN');
  });

  it('removes a hat (200) and fixes equipped, and 400s an out-of-range index', async () => {
    const id = uid();
    await putUser({ user_id: id, display_name: 'J', created_at: '2026-04-21T00:00:00.000Z' }, 'H');
    const h = horse('Hatty');
    await putStableHorse(id, h);
    await equipHat(id, h.stable_horse_id, 1);

    const res: any = await removeHat(ev({ params: { user_id: id, stable_horse_id: h.stable_horse_id, index: '1' }, token: token() }) as any);
    expect(res.statusCode).toBe(200);
    const updated = JSON.parse(res.body);
    expect(updated.hats.map((x: any) => x.id)).toEqual(['flat_cap']);
    expect(updated.equipped_hat ?? null).toBeNull();

    const oob: any = await removeHat(ev({ params: { user_id: id, stable_horse_id: h.stable_horse_id, index: '9' }, token: token() }) as any);
    expect(oob.statusCode).toBe(400);
  });

  it('deletes a horse (200), frees the name, and 404s unknown', async () => {
    const id = uid();
    await putUser({ user_id: id, display_name: 'J', created_at: '2026-04-21T00:00:00.000Z' }, 'H');
    const h = horse('Doomed');
    await putStableHorse(id, h);

    const res: any = await deleteHorse(ev({ params: { user_id: id, stable_horse_id: h.stable_horse_id }, token: token() }) as any);
    expect(res.statusCode).toBe(200);
    expect(await getStableHorse(id, h.stable_horse_id)).toBeNull();
    await putStableHorse(id, { ...horse('Doomed'), stable_horse_id: `sh-${Math.random().toString(36).slice(2)}` });

    const miss: any = await deleteHorse(ev({ params: { user_id: id, stable_horse_id: 'sh-nope' }, token: token() }) as any);
    expect(miss.statusCode).toBe(404);
  });
});
