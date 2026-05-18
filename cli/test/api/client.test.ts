import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { request, ApiError, _resetIdentityCacheForTests } from '../../src/api/client.js';
import { saveIdentity } from '../../src/identity/identity.js';

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  });
}

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-client-'));
  process.env.TOKEN_DERBY_HOME = tmp;
  _resetIdentityCacheForTests();
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
  _resetIdentityCacheForTests();
});

describe('request', () => {
  it('returns parsed JSON on 2xx', async () => {
    const fetch = fakeFetch(200, { hello: 'world' });
    const out = await request<{ hello: string }>('GET', '/foo', undefined, undefined, fetch as any);
    expect(out).toEqual({ hello: 'world' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('throws ApiError on a JSON error envelope', async () => {
    const fetch = fakeFetch(409, { code: 'RACE_FULL', message: 'full!' });
    await expect(request('POST', '/foo', { x: 1 }, undefined, fetch as any))
      .rejects.toMatchObject({
        code: 'RACE_FULL',
        message: 'full!',
        status: 409,
      });
  });

  it('attaches Authorization header when authToken is provided', async () => {
    const fetch = fakeFetch(200, {});
    await request('POST', '/foo', { y: 2 }, 'tok-abc', fetch as any);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer tok-abc');
  });

  it('omits body when undefined', async () => {
    const fetch = fakeFetch(200, {});
    await request('GET', '/foo', undefined, undefined, fetch as any);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBeUndefined();
  });

  it('JSON-encodes object body and sets content-type', async () => {
    const fetch = fakeFetch(200, {});
    await request('POST', '/foo', { a: 1 }, undefined, fetch as any);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('wraps non-JSON 5xx responses with NETWORK_ERROR', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => 'text/html' },
      text: async () => '<html>bad gateway</html>',
    });
    await expect(request('GET', '/foo', undefined, undefined, fetch as any))
      .rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 502 });
  });

  it('wraps fetch-thrown errors with NETWORK_ERROR', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(request('GET', '/foo', undefined, undefined, fetch as any))
      .rejects.toMatchObject({ code: 'NETWORK_ERROR', message: expect.stringContaining('ECONNREFUSED') });
  });

  it('uses apiBase() to resolve the URL when path starts with /', async () => {
    process.env.TOKEN_DERBY_API_BASE = 'https://example.test/api';
    const fetch = fakeFetch(200, {});
    await request('GET', '/races/ABC', undefined, undefined, fetch as any);
    expect(fetch.mock.calls[0]?.[0]).toBe('https://example.test/api/races/ABC');
    delete process.env.TOKEN_DERBY_API_BASE;
  });

  it('attaches X-Cli-Version header on every request', async () => {
    const fetch = fakeFetch(200, {});
    await request('GET', '/foo', undefined, undefined, fetch as any);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-cli-version']).toBeTruthy();
    expect(headers['x-cli-version']).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('surfaces VERSION_MISMATCH error envelope', async () => {
    const fetch = fakeFetch(426, { code: 'VERSION_MISMATCH', message: 'upgrade pls' });
    await expect(request('POST', '/foo', {}, undefined, fetch as any))
      .rejects.toMatchObject({ code: 'VERSION_MISMATCH', status: 426 });
  });

  it('attaches X-User-Id and X-User-Token when identity is set', async () => {
    await saveIdentity({
      user_id: '12345678-1234-1234-1234-123456789012',
      display_name: 'Alice',
      secret_token: 'super_secret_xyz',
      created_at: '2026-05-14T10:00:00Z',
    });
    const fetch = fakeFetch(200, {});
    await request('GET', '/foo', undefined, undefined, fetch as any);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-user-id']).toBe('12345678-1234-1234-1234-123456789012');
    expect(headers['x-user-token']).toBe('super_secret_xyz');
    // Display name is NOT sent (server has it stored).
    expect(headers['x-user-name']).toBeUndefined();
  });

  it('attaches a User-Agent header on every request', async () => {
    const fetch = fakeFetch(200, {});
    await request('GET', '/foo', undefined, undefined, fetch as any);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['user-agent']).toMatch(/^token-derby\//);
  });

  it('omits identity headers when no identity is saved', async () => {
    const fetch = fakeFetch(200, {});
    await request('GET', '/foo', undefined, undefined, fetch as any);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-user-id']).toBeUndefined();
    expect(headers['x-user-token']).toBeUndefined();
  });

  it('surfaces UNAUTHENTICATED and STABLE_HORSE_NOT_FOUND error envelopes', async () => {
    const fUnauth = fakeFetch(401, { code: 'UNAUTHENTICATED', message: 'bad token' });
    await expect(request('POST', '/x', {}, undefined, fUnauth as any))
      .rejects.toMatchObject({ code: 'UNAUTHENTICATED', status: 401 });

    const fStable = fakeFetch(404, { code: 'STABLE_HORSE_NOT_FOUND', message: "no horse" });
    await expect(request('POST', '/x', {}, undefined, fStable as any))
      .rejects.toMatchObject({ code: 'STABLE_HORSE_NOT_FOUND', status: 404 });
  });
});

describe('ApiError', () => {
  it('exposes code, message, and status', () => {
    const e = new ApiError('RACE_FULL', 'full!', 409);
    expect(e.code).toBe('RACE_FULL');
    expect(e.message).toBe('full!');
    expect(e.status).toBe(409);
    expect(e instanceof Error).toBe(true);
  });
});
