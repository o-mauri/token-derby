import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setToken, clearToken } from '../src/auth.js';
import { renameUser, renameHorse, removeHat, deleteHorse, ApiError } from '../src/api.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => { clearToken(); });

describe('admin mutation client', () => {
  it('renameUser PUTs the name with the bearer token', async () => {
    setToken('tk');
    const f = vi.fn(async () => jsonResponse(200, { user_id: 'u1', display_name: 'New' }));
    const res = await renameUser('u1', 'New', f as any);
    expect(res.display_name).toBe('New');
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe('/api/admin/users/u1');
    expect(init.method).toBe('PUT');
    expect(init.headers.authorization).toBe('Bearer tk');
    expect(JSON.parse(init.body)).toEqual({ display_name: 'New' });
  });

  it('renameHorse PUTs to the horse path', async () => {
    setToken('tk');
    const f = vi.fn(async () => jsonResponse(200, { stable_horse_id: 'h1', name: 'X' }));
    await renameHorse('u1', 'h1', 'X', f as any);
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe('/api/admin/users/u1/horses/h1');
    expect(init.method).toBe('PUT');
  });

  it('removeHat DELETEs the hat-index path with no body', async () => {
    setToken('tk');
    const f = vi.fn(async () => jsonResponse(200, { stable_horse_id: 'h1', hats: [] }));
    await removeHat('u1', 'h1', 2, f as any);
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe('/api/admin/users/u1/horses/h1/hats/2');
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('deleteHorse DELETEs the horse path', async () => {
    setToken('tk');
    const f = vi.fn(async () => jsonResponse(200, { deleted: true }));
    const res = await deleteHorse('u1', 'h1', f as any);
    expect(res.deleted).toBe(true);
    const [url, init] = f.mock.calls[0] as any;
    expect(url).toBe('/api/admin/users/u1/horses/h1');
    expect(init.method).toBe('DELETE');
  });

  it('throws UNAUTHENTICATED without a token and never calls fetch', async () => {
    const f = vi.fn();
    await expect(renameUser('u1', 'X', f as any)).rejects.toBeInstanceOf(ApiError);
    expect(f).not.toHaveBeenCalled();
  });

  it('throws a 401 ApiError when the server rejects the token', async () => {
    setToken('stale');
    const f = vi.fn(async () => jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'no' }));
    await expect(deleteHorse('u1', 'h1', f as any)).rejects.toMatchObject({ status: 401 });
  });
});
