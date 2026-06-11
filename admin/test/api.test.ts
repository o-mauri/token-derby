import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setToken, getToken, clearToken } from '../src/auth.js';
import { login, fetchUsers, ApiError } from '../src/api.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  clearToken();
});

describe('auth token storage', () => {
  it('stores, reads and clears the token', () => {
    expect(getToken()).toBeNull();
    setToken('abc.def');
    expect(getToken()).toBe('abc.def');
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe('login', () => {
  it('posts credentials and returns the token payload', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { token: 't.t', expires_at: '2026-06-11T20:00:00Z' }));
    const res = await login('omar', 'pw', fetchImpl as any);
    expect(res.token).toBe('t.t');
    const call = fetchImpl.mock.calls[0];
    expect(call[0]).toBe('/api/admin/login');
    expect(JSON.parse((call[1] as any).body)).toEqual({ username: 'omar', password: 'pw' });
  });

  it('throws ApiError on bad credentials', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'no' }));
    await expect(login('omar', 'bad', fetchImpl as any)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('fetchUsers', () => {
  it('attaches the bearer token', async () => {
    setToken('my.token');
    const fetchImpl = vi.fn(async () => jsonResponse(200, { users: [] }));
    await fetchUsers(fetchImpl as any);
    const init = fetchImpl.mock.calls[0][1] as any;
    expect(init.headers.authorization).toBe('Bearer my.token');
  });

  it('throws a 401 ApiError when the token is rejected', async () => {
    setToken('stale');
    const fetchImpl = vi.fn(async () => jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'no' }));
    await expect(fetchUsers(fetchImpl as any)).rejects.toMatchObject({ status: 401 });
  });

  it('throws UNAUTHENTICATED without making a request when no token is stored', async () => {
    clearToken();
    const fetchImpl = vi.fn();
    await expect(fetchUsers(fetchImpl as any)).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
