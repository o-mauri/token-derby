import { describe, it, expect, vi } from 'vitest';
import { createTransport, createEndpoints } from '@token-derby/client';
import { guard } from '../electron/services/api.js';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('guard', () => {
  it('turns an ApiError-shaped 404 into a Result', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ code: 'RACE_NOT_FOUND', message: 'no such race' }, 404),
    );
    const transport = createTransport({
      baseUrl: 'http://localhost:1234/api',
      client: 'desktop',
      clientVersion: '0.0.0-test',
      getIdentity: async () => null,
      fetchImpl,
    });
    const api = createEndpoints(transport);

    const result = await guard(() => api.getRace('ABC123'));

    expect(result).toEqual({ ok: false, code: 'RACE_NOT_FOUND', message: 'no such race' });
  });

  it('wraps a successful call as ok:true with the resolved data', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ race_id: 'r1' }, 200));
    const transport = createTransport({
      baseUrl: 'http://localhost:1234/api',
      client: 'desktop',
      clientVersion: '0.0.0-test',
      getIdentity: async () => null,
      fetchImpl,
    });
    const api = createEndpoints(transport);

    const result = await guard(() => api.getRace('ABC123'));

    expect(result).toEqual({ ok: true, data: { race_id: 'r1' } });
  });

  it('turns an unexpected throw into an ok:false Result instead of rejecting', async () => {
    const result = await guard(async () => {
      throw new Error('boom');
    });

    expect(result).toEqual({ ok: false, code: 'UNKNOWN', message: 'boom' });
  });

  it('turns a network failure into a NETWORK_ERROR Result', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const transport = createTransport({
      baseUrl: 'http://localhost:1234/api',
      client: 'desktop',
      clientVersion: '0.0.0-test',
      getIdentity: async () => null,
      fetchImpl,
    });
    const api = createEndpoints(transport);

    const result = await guard(() => api.getRace('ABC123'));

    expect(result).toEqual({ ok: false, code: 'NETWORK_ERROR', message: 'fetch failed' });
  });
});
