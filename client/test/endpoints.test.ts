import { describe, it, expect, vi } from 'vitest';
import { createTransport } from '../src/transport.js';
import { createEndpoints } from '../src/endpoints.js';

function makeEndpoints(fetchImpl: any) {
  const transport = createTransport({
    baseUrl: 'https://x/api',
    client: 'cli',
    clientVersion: '2.12.2',
    getIdentity: async () => null,
    fetchImpl,
  });
  return createEndpoints(transport);
}

describe('endpoints', () => {
  it('getRace GETs /races/<joinCode>', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ race_id: 'r', join_code: 'JC1234', status: 'lobby' }),
    });
    const { getRace } = makeEndpoints(fetch);
    await getRace('JC1234');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://x/api/races/JC1234');
    expect((fetch.mock.calls[0]?.[1] as RequestInit).method).toBe('GET');
  });

  it('getRaceSeries GETs /races/<joinCode>/series', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ start_ms: 0, end_ms: 1, horses: [] }),
    });
    const { getRaceSeries } = makeEndpoints(fetch);
    await getRaceSeries('JC1234');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://x/api/races/JC1234/series');
    expect((fetch.mock.calls[0]?.[1] as RequestInit).method).toBe('GET');
  });

  it('listStable GETs /jockey/me/horses', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ horses: [] }),
    });
    const { listStable } = makeEndpoints(fetch);
    await listStable();
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://x/api/jockey/me/horses');
  });

  it('createStableHorse POSTs to /jockey/me/horses with body', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({
        stable_horse_id: 'sh', name: 'Gary',
        colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
        created_at: 'now',
      }),
    });
    const { createStableHorse } = makeEndpoints(fetch);
    await createStableHorse({ name: 'Gary', colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' } });
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://x/api/jockey/me/horses');
    expect(init.body).toBe(JSON.stringify({ name: 'Gary', colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' } }));
  });

  it('listOrganisations GETs /organisations', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ organisations: [] }),
    });
    const { listOrganisations } = makeEndpoints(fetch);
    await listOrganisations();
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://x/api/organisations');
  });

  it('joinOrganisation POSTs to /organisations/join', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ org_id: 'o', org_name: 'Acme' }),
    });
    const { joinOrganisation } = makeEndpoints(fetch);
    await joinOrganisation({ join_token: 'tok' });
    expect(fetch.mock.calls[0]?.[0]).toBe('https://x/api/organisations/join');
    const init = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.body).toBe(JSON.stringify({ join_token: 'tok' }));
  });

  it('getOrgLeaderboard GETs /organisations/<orgName>/leaderboard', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ org_name: 'Acme', horses: [] }),
    });
    const { getOrgLeaderboard } = makeEndpoints(fetch);
    await getOrgLeaderboard('Acme');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://x/api/organisations/Acme/leaderboard');
    expect((fetch.mock.calls[0]?.[1] as RequestInit).method).toBe('GET');
  });

  it('getOrgLeagueStandings GETs /organisations/<orgName>/league/standings', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ standings: null }),
    });
    const { getOrgLeagueStandings } = makeEndpoints(fetch);
    await getOrgLeagueStandings('Acme');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://x/api/organisations/Acme/league/standings');
    expect((fetch.mock.calls[0]?.[1] as RequestInit).method).toBe('GET');
  });

  it('getOrgLeagueStandings encodes an org name with a space', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => 'application/json' },
      text: async () => JSON.stringify({ standings: null }),
    });
    const { getOrgLeagueStandings } = makeEndpoints(fetch);
    await getOrgLeagueStandings('Acme Corp');
    expect(fetch.mock.calls[0]?.[0]).toBe('https://x/api/organisations/Acme%20Corp/league/standings');
  });
});
