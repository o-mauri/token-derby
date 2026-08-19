import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { signSession } from '../../src/lib/admin-auth.js';
import { HATS } from '@token-derby/shared';

const SECRET = 'claims-secret';
vi.mock('../../src/lib/admin-config.js', () => ({
  loadAdminConfig: vi.fn(async () => ({ username: 'omar', passwordHash: 'x:y', sessionSecret: SECRET })),
}));

import { handler as createClaim } from '../../src/handlers/admin-create-claim.js';
import { handler as listClaimsHandler } from '../../src/handlers/admin-list-claims.js';

const token = () => signSession(SECRET, { sub: 'admin', exp: Math.floor(Date.now() / 1000) + 60 });
const LEGENDARY = HATS.find(h => h.rarity === 'legendary')!.id;

function ev(opts: { body?: unknown; token?: string }): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (opts.token) headers['authorization'] = `Bearer ${opts.token}`;
  return {
    headers,
    pathParameters: {},
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  } as unknown as APIGatewayProxyEventV2;
}

const body = (res: any) => JSON.parse(res.body);

describe('admin-create-claim', () => {
  it('rejects a missing session with 401', async () => {
    const res = await createClaim(ev({ body: { item_type: 'hat', hat_id: 'flat_cap', variant: 0 } }));
    expect(res.statusCode).toBe(401);
  });

  it('mints a claim with a default 30 day expiry', async () => {
    const res = await createClaim(ev({ token: token(), body: { item_type: 'hat', hat_id: 'flat_cap', variant: 0 } }));
    expect(res.statusCode).toBe(200);
    const b = body(res);
    expect(b.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/);
    expect(b.hat_id).toBe('flat_cap');
    expect(b.variant).toBe(0);
    const days = (Date.parse(b.expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThan(30.1);
  });

  it('honours an explicit expiry', async () => {
    const res = await createClaim(ev({ token: token(), body: { item_type: 'hat', hat_id: 'flat_cap', variant: 0, expires_in_days: 1 } }));
    const days = (Date.parse(body(res).expires_at) - Date.now()) / 86_400_000;
    expect(days).toBeLessThan(1.1);
  });

  it('mints a legendary claim with no variant', async () => {
    const res = await createClaim(ev({ token: token(), body: { item_type: 'hat', hat_id: LEGENDARY } }));
    expect(res.statusCode).toBe(200);
    expect(body(res).variant).toBeUndefined();
  });

  it('rejects an unknown hat_id', async () => {
    const res = await createClaim(ev({ token: token(), body: { item_type: 'hat', hat_id: 'nope', variant: 0 } }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects an out-of-range variant', async () => {
    const res = await createClaim(ev({ token: token(), body: { item_type: 'hat', hat_id: 'flat_cap', variant: 99 } }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects a variant on a legendary', async () => {
    const res = await createClaim(ev({ token: token(), body: { item_type: 'hat', hat_id: LEGENDARY, variant: 0 } }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects a missing variant on a non-legendary', async () => {
    const res = await createClaim(ev({ token: token(), body: { item_type: 'hat', hat_id: 'flat_cap' } }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects a bad item_type', async () => {
    const res = await createClaim(ev({ token: token(), body: { item_type: 'sticker', hat_id: 'flat_cap', variant: 0 } }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects out-of-bounds expiry', async () => {
    for (const d of [0, -5, 366, 1.5, 'ten']) {
      const res = await createClaim(ev({ token: token(), body: { item_type: 'hat', hat_id: 'flat_cap', variant: 0, expires_in_days: d } }));
      expect(res.statusCode, `expires_in_days=${d}`).toBe(400);
    }
  });

  it('rejects a missing body', async () => {
    const res = await createClaim(ev({ token: token() }));
    expect(res.statusCode).toBe(400);
  });
});

describe('admin-list-claims', () => {
  it('rejects a missing session with 401', async () => {
    expect((await listClaimsHandler(ev({}))).statusCode).toBe(401);
  });

  it('includes a freshly minted claim', async () => {
    const created = body(await createClaim(ev({ token: token(), body: { item_type: 'hat', hat_id: 'beanie', variant: 0 } })));
    const res = await listClaimsHandler(ev({ token: token() }));
    expect(res.statusCode).toBe(200);
    const codes = body(res).claims.map((c: any) => c.code);
    expect(codes).toContain(created.code);
  });
});
