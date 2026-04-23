import { describe, it, expect, vi } from 'vitest';
import { request, ApiError } from '../../src/api/client.js';

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  });
}

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
