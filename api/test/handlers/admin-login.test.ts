import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { hashPassword } from '../../src/lib/admin-auth.js';

const PASSWORD = 'correct horse battery staple';
const CONFIG = { username: 'omar', passwordHash: hashPassword(PASSWORD), sessionSecret: 'unit-test-secret' };

vi.mock('../../src/lib/admin-config.js', () => ({
  loadAdminConfig: vi.fn(async () => CONFIG),
}));

import { handler } from '../../src/handlers/admin-login.js';

function ev(body: unknown): APIGatewayProxyEventV2 {
  return {
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  } as unknown as APIGatewayProxyEventV2;
}

describe('admin-login handler', () => {
  it('returns a token for valid credentials', async () => {
    const res: any = await handler(ev({ username: 'omar', password: PASSWORD }) as any);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.token).toBe('string');
    expect(body.token.split('.').length).toBe(2);
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a wrong password with 401', async () => {
    const res: any = await handler(ev({ username: 'omar', password: 'wrong' }) as any);
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
  });

  it('rejects an unknown username with 401', async () => {
    const res: any = await handler(ev({ username: 'someone', password: PASSWORD }) as any);
    expect(res.statusCode).toBe(401);
  });

  it('rejects a malformed body with 400', async () => {
    const res: any = await handler(ev({ username: 'omar' }) as any);
    expect(res.statusCode).toBe(400);
  });

  it('rejects a request with no body at all with 400', async () => {
    const res: any = await handler(ev(undefined) as any);
    expect(res.statusCode).toBe(400);
  });
});
