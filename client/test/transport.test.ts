import { describe, it, expect } from 'vitest';
import { createTransport } from '../src/index.js';

function stubFetch(capture: { url?: string; headers?: any }) {
  return async (url: string, init: any) => {
    capture.url = url; capture.headers = init.headers;
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

describe('createTransport', () => {
  it('sends desktop headers + identity when client is desktop', async () => {
    const cap: any = {};
    const t = createTransport({
      baseUrl: 'https://x/api', client: 'desktop', clientVersion: '0.1.0',
      getIdentity: async () => ({ user_id: 'u1', secret_token: 's1' }),
      fetchImpl: stubFetch(cap) as any,
    });
    await t.request('GET', '/jockey/me', undefined, undefined);
    expect(cap.url).toBe('https://x/api/jockey/me');
    expect(cap.headers['x-client']).toBe('desktop');
    expect(cap.headers['x-client-version']).toBe('0.1.0');
    expect(cap.headers['x-user-id']).toBe('u1');
    expect(cap.headers['x-user-token']).toBe('s1');
    expect(cap.headers['x-cli-version']).toBeUndefined();
  });

  it('sends x-cli-version (no x-client) when client is cli', async () => {
    const cap: any = {};
    const t = createTransport({
      baseUrl: 'https://x/api', client: 'cli', clientVersion: '2.12.2',
      getIdentity: async () => null, fetchImpl: stubFetch(cap) as any,
    });
    await t.request('GET', '/races/ABC', undefined, undefined);
    expect(cap.headers['x-cli-version']).toBe('2.12.2');
    expect(cap.headers['x-client']).toBeUndefined();
  });

  it('resolves baseUrl when given as a function', async () => {
    const cap: any = {};
    const t = createTransport({
      baseUrl: () => 'https://x/api', client: 'desktop', clientVersion: '0.1.0',
      getIdentity: async () => null, fetchImpl: stubFetch(cap) as any,
    });
    await t.request('GET', '/jockey/me', undefined, undefined);
    expect(cap.url).toBe('https://x/api/jockey/me');
  });
});
