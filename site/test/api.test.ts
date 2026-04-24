import { describe, it, expect, vi } from 'vitest';
import { fetchRace, ApiError } from '../src/api.js';

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
  });
}

describe('fetchRace', () => {
  it('GETs /api/races/<code> and returns parsed JSON', async () => {
    const body = { race_id: 'r', join_code: 'ABC123', status: 'live', horses: [] };
    const fetch = fakeFetch(200, body);
    const race = await fetchRace('ABC123', fetch as any);
    expect(race.race_id).toBe('r');
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/races/ABC123');
  });

  it('URL-encodes the join code', async () => {
    const fetch = fakeFetch(200, {});
    await fetchRace('A/B', fetch as any);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/races/A%2FB');
  });

  it('throws ApiError with code on error envelope', async () => {
    const fetch = fakeFetch(404, { code: 'RACE_NOT_FOUND', message: 'nope' });
    await expect(fetchRace('NOPE99', fetch as any)).rejects.toMatchObject({
      code: 'RACE_NOT_FOUND',
      status: 404,
    });
  });

  it('throws ApiError with NETWORK_ERROR on fetch rejection', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(fetchRace('ABC', fetch as any)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });
});
