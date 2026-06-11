import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createHmac } from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  bearerToken,
  requireAdmin,
} from '../../src/lib/admin-auth.js';

const SECRET = 'test-signing-secret';
const nowSec = () => Math.floor(Date.now() / 1000);

function ev(authHeader?: string): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers['authorization'] = authHeader;
  return { headers } as unknown as APIGatewayProxyEventV2;
}

describe('admin-auth password', () => {
  it('verifies a correct password and rejects a wrong one', () => {
    const stored = hashPassword('hunter2');
    expect(stored).toContain(':');
    expect(verifyPassword('hunter2', stored)).toBe(true);
    expect(verifyPassword('nope', stored)).toBe(false);
  });

  it('rejects a malformed stored hash without throwing', () => {
    expect(verifyPassword('hunter2', 'garbage')).toBe(false);
  });

  it('rejects a valid-hex hash of the wrong length without throwing', () => {
    expect(verifyPassword('hunter2', 'aabb:ccdd')).toBe(false);
  });
});

describe('admin-auth session', () => {
  it('round-trips a signed session', () => {
    const token = signSession(SECRET, { sub: 'admin', exp: nowSec() + 60 });
    const v = verifySession(SECRET, token);
    expect(v.ok).toBe(true);
  });

  it('rejects an expired token', () => {
    const token = signSession(SECRET, { sub: 'admin', exp: nowSec() - 1 });
    const v = verifySession(SECRET, token);
    expect(v.ok).toBe(false);
  });

  it('rejects a tampered signature', () => {
    const token = signSession(SECRET, { sub: 'admin', exp: nowSec() + 60 });
    const tampered = token.slice(0, -2) + (token.endsWith('a') ? 'bb' : 'aa');
    expect(verifySession(SECRET, tampered).ok).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signSession('other-secret', { sub: 'admin', exp: nowSec() + 60 });
    expect(verifySession(SECRET, token).ok).toBe(false);
  });

  it('rejects garbage tokens', () => {
    expect(verifySession(SECRET, 'not.a.token').ok).toBe(false);
    expect(verifySession(SECRET, '').ok).toBe(false);
  });

  it('returns ok:false (does not throw) for a validly-signed null payload', () => {
    const body = Buffer.from('null').toString('base64url');
    const sig = Buffer.from(createHmac('sha256', SECRET).update(body).digest()).toString('base64url');
    const token = `${body}.${sig}`;
    expect(() => verifySession(SECRET, token)).not.toThrow();
    expect(verifySession(SECRET, token).ok).toBe(false);
  });
});

describe('bearerToken / requireAdmin', () => {
  it('extracts a bearer token case-insensitively', () => {
    expect(bearerToken(ev('Bearer abc.def'))).toBe('abc.def');
    expect(bearerToken(ev('bearer abc.def'))).toBe('abc.def');
    expect(bearerToken(ev())).toBeNull();
    expect(bearerToken(ev('Basic xyz'))).toBeNull();
  });

  it('requireAdmin accepts a valid token and rejects a missing one', () => {
    const token = signSession(SECRET, { sub: 'admin', exp: nowSec() + 60 });
    expect(requireAdmin(ev(`Bearer ${token}`), SECRET).ok).toBe(true);
    expect(requireAdmin(ev(), SECRET).ok).toBe(false);
    expect(requireAdmin(ev('Bearer bad'), SECRET).ok).toBe(false);
  });
});
