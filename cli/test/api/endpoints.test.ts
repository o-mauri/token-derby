import { describe, it, expect, vi } from 'vitest';

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
    await heartbeat('JC1234', 'h-1', 'tok-xyz', { current_tokens: 42 });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer tok-xyz');
  });

  it('createOrganisation POSTs to /organisations', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ org_id: 'o', org_name: 'Acme', org_join_token: 't' }),
    });
    (globalThis as any).fetch = fetch;
    const { createOrganisation } = await import('../../src/api/endpoints.js');
    const out = await createOrganisation({ name: 'Acme' });
    expect(out.org_join_token).toBe('t');
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/organisations$/);
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
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

  it('getOrganisation GETs /organisations/<name> with URL-encoded name', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({
        org_id: 'o', org_name: 'Acme', org_join_token: 't',
        created_at: 'now', creator_user_name: 'Alice',
      }),
    });
    (globalThis as any).fetch = fetch;
    const { getOrganisation } = await import('../../src/api/endpoints.js');
    await getOrganisation('Acme');
    expect(fetch.mock.calls[0]?.[0]).toMatch(/\/organisations\/Acme$/);
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
});
