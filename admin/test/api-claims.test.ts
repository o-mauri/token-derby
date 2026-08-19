import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClaim, fetchClaims } from '../src/api.js';
import { setToken, clearToken } from '../src/auth.js';

beforeEach(() => { clearToken(); setToken('admin-token'); });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

describe('createClaim', () => {
  it('POSTs to /api/admin/claims with the bearer token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      code: 'ABCDEFGHJKLM', item_type: 'hat', hat_id: 'flat_cap', variant: 0,
      expires_at: '2026-09-17T00:00:00.000Z',
    }));
    const res = await createClaim({ item_type: 'hat', hat_id: 'flat_cap', variant: 0 }, fetchImpl as any);
    expect(res.code).toBe('ABCDEFGHJKLM');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/admin/claims');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      item_type: 'hat', hat_id: 'flat_cap', variant: 0,
    });
    expect((init as any).headers.authorization).toBe('Bearer admin-token');
  });

  it('surfaces a server error code', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ code: 'BAD_REQUEST', message: 'nope' }, 400));
    await expect(createClaim({ item_type: 'hat', hat_id: 'x', variant: 0 }, fetchImpl as any))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('fetchClaims', () => {
  it('GETs /api/admin/claims', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ claims: [] }));
    expect(await fetchClaims(fetchImpl as any)).toEqual({ claims: [] });
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/admin/claims');
  });
});
