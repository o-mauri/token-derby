import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClaim, fetchClaims, fetchClaimRedemptions } from '../src/api.js';
import { setToken, clearToken } from '../src/auth.js';

beforeEach(() => { clearToken(); setToken('admin-token'); });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

describe('createClaim', () => {
  it('POSTs to /api/admin/claims with the bearer token', async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => jsonResponse({
      code: 'ABCDEFGHJKLM', item_type: 'hat',
      entries: [{ hat_id: 'flat_cap', variant: 0 }],
      max_redemptions: 1,
      expires_at: '2026-09-17T00:00:00.000Z',
    }));
    const res = await createClaim({
      item_type: 'hat', entries: [{ hat_id: 'flat_cap', variant: 0 }],
    }, fetchImpl as any);
    expect(res.code).toBe('ABCDEFGHJKLM');
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/admin/claims');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      item_type: 'hat', entries: [{ hat_id: 'flat_cap', variant: 0 }],
    });
    expect((init as any).headers.authorization).toBe('Bearer admin-token');
  });

  it('surfaces a server error code', async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => jsonResponse({ code: 'BAD_REQUEST', message: 'nope' }, 400));
    await expect(createClaim({ item_type: 'hat', entries: [{ hat_id: 'x' }] }, fetchImpl as any))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('fetchClaims', () => {
  it('GETs /api/admin/claims', async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => jsonResponse({ claims: [] }));
    expect(await fetchClaims(fetchImpl as any)).toEqual({ claims: [] });
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/admin/claims');
  });
});

describe('fetchClaimRedemptions', () => {
  it('GETs /api/admin/claims/:code/redemptions with the bearer token', async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => jsonResponse({ redemptions: [] }));
    expect(await fetchClaimRedemptions('ABCDEFGHJKLM', fetchImpl as any)).toEqual({ redemptions: [] });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/admin/claims/ABCDEFGHJKLM/redemptions');
    expect((init as any).headers.authorization).toBe('Bearer admin-token');
  });

  it('encodes the claim code in the path', async () => {
    const fetchImpl = vi.fn(async (..._args: FetchArgs) => jsonResponse({ redemptions: [] }));
    await fetchClaimRedemptions('AB/CD', fetchImpl as any);
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/admin/claims/AB%2FCD/redemptions');
  });
});
