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
});
