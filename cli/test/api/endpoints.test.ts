import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

describe('endpoints', () => {
  it('createRace POSTs to /races', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ race_id: 'r', join_code: 'JC1234', admin_code: 'a' }),
    });
    (globalThis as any).fetch = fetch;
    const { createRace } = await import('../../src/api/endpoints.js');
    const out = await createRace({ name: 'x', start_time: 's', end_time: 'e', tz: 'UTC' });
    expect(out.join_code).toBe('JC1234');
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/races$/);
  });

  it('heartbeat sends Bearer token', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ race_status: 'live', server_time: 'now', time_left_seconds: 100 }),
    });
    (globalThis as any).fetch = fetch;
    const { heartbeat } = await import('../../src/api/endpoints.js');
    await heartbeat('JC1234', 'h-1', 'tok-xyz', { seq: 1, delta: 42 });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer tok-xyz');
    expect(init.body).toBe(JSON.stringify({ seq: 1, delta: 42 }));
  });

  it('joinOrganisation POSTs to /organisations/join', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ org_id: 'o', org_name: 'Acme' }),
    });
    (globalThis as any).fetch = fetch;
    const { joinOrganisation } = await import('../../src/api/endpoints.js');
    await joinOrganisation({ join_token: 'tok' });
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/organisations\/join$/);
  });

  it('listOrganisations GETs /organisations', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ organisations: [] }),
    });
    (globalThis as any).fetch = fetch;
    const { listOrganisations } = await import('../../src/api/endpoints.js');
    await listOrganisations();
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/organisations$/);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('GET');
  });

  it('joinRace sends { stable_horse_id } body', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ horse_id: 'h1', heartbeat_token: 'tok' }),
    });
    (globalThis as any).fetch = fetch;
    const { joinRace } = await import('../../src/api/endpoints.js');
    await joinRace('JC1234', { stable_horse_id: 'sh-1' });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ stable_horse_id: 'sh-1' }));
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/races\/JC1234\/join$/);
  });

  it('initJockey POSTs to /jockey/init', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ user_id: 'u', display_name: 'A', secret_token: 'tok' }),
    });
    (globalThis as any).fetch = fetch;
    const { initJockey } = await import('../../src/api/endpoints.js');
    const out = await initJockey({ display_name: 'A' });
    expect(out.secret_token).toBe('tok');
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/jockey\/init$/);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
  });

  it('updateJockey PUTs to /jockey/me', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ user_id: 'u', display_name: 'B' }),
    });
    (globalThis as any).fetch = fetch;
    const { updateJockey } = await import('../../src/api/endpoints.js');
    await updateJockey({ display_name: 'B' });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/jockey\/me$/);
  });

  it('listStable GETs /jockey/me/horses', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ horses: [] }),
    });
    (globalThis as any).fetch = fetch;
    const { listStable } = await import('../../src/api/endpoints.js');
    await listStable();
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/jockey\/me\/horses$/);
  });

  it('createStableHorse POSTs to /jockey/me/horses', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({
        stable_horse_id: 'sh', name: 'Gary',
        colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
        created_at: 'now',
      }),
    });
    (globalThis as any).fetch = fetch;
    const { createStableHorse } = await import('../../src/api/endpoints.js');
    await createStableHorse({ name: 'Gary', colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' } });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/jockey\/me\/horses$/);
  });

  it('updateStableHorse PUTs to /jockey/me/horses/<id>', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({
        stable_horse_id: 'sh', name: 'Gary',
        colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
        created_at: 'now',
      }),
    });
    (globalThis as any).fetch = fetch;
    const { updateStableHorse } = await import('../../src/api/endpoints.js');
    await updateStableHorse('sh', { name: 'Gary2' });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/jockey\/me\/horses\/sh$/);
  });

  it('deleteStableHorse DELETEs /jockey/me/horses/<id>', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ ok: true }),
    });
    (globalThis as any).fetch = fetch;
    const { deleteStableHorse } = await import('../../src/api/endpoints.js');
    await deleteStableHorse('sh');
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('DELETE');
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/jockey\/me\/horses\/sh$/);
  });

  it('registerDevice POSTs the label to /devices and returns the credential', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ device_id: 'd-1', secret_token: 'tok-new' }),
    });
    (globalThis as any).fetch = fetch;
    const { registerDevice } = await import('../../src/api/endpoints.js');
    const out = await registerDevice({ label: 'omars-laptop' });
    expect(out.secret_token).toBe('tok-new');
    // POST, not the GET that lists devices: same path, and the two would
    // otherwise be indistinguishable from here.
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/devices$/);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ label: 'omars-laptop' }));
  });

  it('logoutDevice DELETEs /devices/me', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ revoked: true }),
    });
    (globalThis as any).fetch = fetch;
    const { logoutDevice } = await import('../../src/api/endpoints.js');
    const out = await logoutDevice();
    expect(out.revoked).toBe(true);
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/devices\/me$/);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('DELETE');
  });

  describe('revokeDevice', () => {
    let tmp: string;

    beforeEach(async () => {
      tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-revoke-'));
      process.env.TOKEN_DERBY_HOME = tmp;
      const { _resetIdentityCacheForTests } = await import('../../src/api/client.js');
      _resetIdentityCacheForTests();
    });

    afterEach(async () => {
      delete process.env.TOKEN_DERBY_HOME;
      await fs.rm(tmp, { recursive: true, force: true });
      const { _resetIdentityCacheForTests } = await import('../../src/api/client.js');
      _resetIdentityCacheForTests();
    });

    it('DELETEs /devices/<id> authenticated as the passed credential, not any cached identity.json', async () => {
      // A decoy identity is on disk — proving the override wins, rather than
      // merely proving headers appear at all (which an unrelated cached
      // identity would also produce).
      const { saveIdentity } = await import('../../src/identity/identity.js');
      await saveIdentity({
        user_id: 'decoy-user-id',
        display_name: 'Decoy',
        secret_token: 'decoy-token',
        created_at: '2026-01-01T00:00:00Z',
      });

      const fetch = vi.fn().mockResolvedValue({
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ ok: true }),
      });
      (globalThis as any).fetch = fetch;

      const { revokeDevice } = await import('../../src/api/endpoints.js');
      await revokeDevice('device-123', { user_id: 'real-user-id', secret_token: 'real-device-token' });

      expect(fetch.mock.calls[0]?.[0]).toMatch(/\/devices\/device-123$/);
      const init = fetch.mock.calls[0]?.[1] as RequestInit;
      expect(init.method).toBe('DELETE');
      const headers = init.headers as Record<string, string>;
      expect(headers['x-user-id']).toBe('real-user-id');
      expect(headers['x-user-token']).toBe('real-device-token');
    });
  });
});
