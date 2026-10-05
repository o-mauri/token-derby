import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom, timeout } from 'rxjs';
import type { GetRaceResponse } from '@token-derby/shared';
import { ApiError, apiErrors } from '@token-derby/ui';
import { fixtureInterceptor } from './fixture.interceptor';
import { previewRace } from './race-fixture';

function http(url: string): HttpClient {
  window.history.replaceState(null, '', url);
  TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([apiErrors, fixtureInterceptor]))] });
  return TestBed.inject(HttpClient);
}
const getRace = (client: HttpClient) => firstValueFrom(client.get<GetRaceResponse>('/api/races/PRVRCE'));

describe('fixtureInterceptor', () => {
  afterEach(() => window.history.replaceState(null, '', '/'));

  it('serves the live race by default, with achievements for the ticker', async () => {
    const race = await getRace(http('/preview-race'));
    expect(race.status).toBe('live');
    expect(race.horses.some((h) => (h.recent_events ?? []).length > 0)).toBe(true);
  });

  it('serves the state named in ?state=', async () => {
    expect((await getRace(http('/preview-race?state=pending'))).status).toBe('pending');
  });

  it('serves the finished race with awarded XP and final scores', async () => {
    const race = await getRace(http('/preview-race?state=finished'));
    expect(race.status).toBe('finished');
    expect(race.horses.every((h) => h.xp_awarded! > 0 && h.final_scored_tokens !== undefined)).toBe(true);
  });

  it('pads the field to ?horses=, capped at 40', async () => {
    expect((await getRace(http('/preview-race?horses=20'))).horses).toHaveLength(20);
    TestBed.resetTestingModule();
    expect((await getRace(http('/preview-race?horses=500'))).horses).toHaveLength(40);
  });

  it('serves a league fixture and its season standings under ?league', async () => {
    const client = http('/preview-race?league&state=finished');
    const race = await getRace(client);
    expect(race.league_id).toBeTruthy();
    expect(race.status).toBe('finished');
    const res = await firstValueFrom(client.get<{ standings: { season: number } | null }>('/api/organisations/Anthropic/league/standings?season=2'));
    expect(res.standings?.season).toBe(2);
  });

  it('falls back to live for an unknown state', async () => {
    expect((await getRace(http('/preview-race?state=bogus'))).status).toBe('live');
  });

  it('answers the series and standings endpoints', async () => {
    const client = http('/preview-race');
    const series = await firstValueFrom(client.get<{ horses: unknown[] }>('/api/races/PRVRCE/series'));
    expect(series.horses.length).toBeGreaterThan(0);
    const standings = await firstValueFrom(client.get('/api/organisations/Acme/league/standings?season=1'));
    expect(standings).toEqual({ standings: null });
  });

  it('never answers on /preview-loader', async () => {
    const pending = firstValueFrom(http('/preview-loader').get('/api/races/PRVRCE').pipe(timeout(50)));
    await expect(pending).rejects.toThrow(/Timeout/);
  });

  it('answers RACE_NOT_FOUND on /preview-not-found', async () => {
    const err = await getRace(http('/preview-not-found')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('RACE_NOT_FOUND');
  });
});

describe('previewRace', () => {
  it('puts the pending race in the future with nobody scored', () => {
    const now = Date.now();
    const race = previewRace('pending', now);
    expect(Date.parse(race.start_time)).toBeGreaterThan(now);
    expect(race.horses.every((h) => h.current_tokens === 0)).toBe(true);
  });
});
