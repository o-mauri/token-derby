import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { GetRaceResponse, GetRaceSeriesResponse, HorseView, SeasonStandings } from '@token-derby/shared';
import { ApiError, RESIZE_OBSERVER } from '@token-derby/ui';
import { RaceApi } from './race-api';
import { RacePage } from './race.page';

const T0 = new Date(Date.now() - 3600_000).toISOString();
const T1 = new Date(Date.now() + 3600_000).toISOString();
const horse = (id: string, over: Partial<HorseView> = {}): HorseView => ({
  horse_id: id, stable_horse_id: `s-${id}`, name: `Horse ${id}`, user_name: `u-${id}`,
  colors: { body: '#111111', mane: '#222222', tail: '#222222', saddle: '#333333' },
  current_tokens: 100, last_heartbeat: T0, joined_at: T0, rank: 1, xp: 0, ...over,
} as HorseView);
const race = (over: Partial<GetRaceResponse> = {}): GetRaceResponse => ({
  race_id: 'r', name: 'Friday Derby', join_code: 'ABC123', start_time: T0, end_time: T1, status: 'live',
  server_time: T0, time_left_seconds: 3600, horses: [horse('a', { current_tokens: 500 }), horse('b', { rank: 2 })], ...over,
} as GetRaceResponse);
const SERIES: GetRaceSeriesResponse = { start_ms: Date.parse(T0), end_ms: Date.parse(T1), horses: [{ horse_id: 'a', points: [{ t: Date.parse(T0) + 60_000, d: 40 }] }] };

/** A RaceApi whose responses the test hands out one at a time. */
class FakeRaceApi {
  raceCalls = 0; seriesCalls = 0; standingsCalls = 0;
  next: Array<() => Promise<GetRaceResponse>> = [];
  seriesNext: Array<() => Promise<GetRaceSeriesResponse>> = [];
  standingsResult: () => Promise<{ standings: SeasonStandings | null }> = () => Promise.resolve({ standings: null });
  race(): Promise<GetRaceResponse> { this.raceCalls++; return (this.next.shift() ?? (() => Promise.resolve(race())))(); }
  series(): Promise<GetRaceSeriesResponse> { this.seriesCalls++; return (this.seriesNext.shift() ?? (() => Promise.resolve(SERIES)))(); }
  standings() { this.standingsCalls++; return this.standingsResult(); }
}

@Component({ template: '' })
class Blank {}

async function setup(prime?: (api: FakeRaceApi) => void) {
  const api = new FakeRaceApi();
  prime?.(api);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', component: Blank }]),
      { provide: RaceApi, useValue: api },
      { provide: RESIZE_OBSERVER, useValue: null },
    ],
  });
  const f = TestBed.createComponent(RacePage);
  f.componentRef.setInput('code', 'abc123');
  const el = f.nativeElement as HTMLElement;
  const settle = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); await f.whenStable(); };
  return { f, el, api, settle };
}

describe('RacePage', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }));
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.cdk-overlay-container').forEach((c) => (c.innerHTML = ''));
  });

  it('shows the loader until the first snapshot, then the race (with a blank title meanwhile)', async () => {
    let resolve!: (r: GetRaceResponse) => void;
    const { f, el, settle } = await setup((api) => api.next.push(() => new Promise((r) => (resolve = r))));
    await settle();
    expect(el.querySelector('td-loader')).not.toBeNull();
    expect(el.querySelector('td-race-header .name')?.textContent).toBe('');
    resolve(race());
    await settle();
    expect(el.querySelector('td-loader')).toBeNull();
    expect(el.querySelector('td-race-header .name')?.textContent).toBe('Friday Derby');
    expect(el.querySelectorAll('td-race-lane').length).toBe(2);
    expect(el.querySelector('td-race-header .join-code')?.textContent).toContain('ABC123');
    expect(f).toBeTruthy();
  });

  it('shows not-found for an unknown race, quoting the code, with a way home', async () => {
    const { el, settle } = await setup((api) => api.next.push(() => Promise.reject(new ApiError('RACE_NOT_FOUND', 'nope', 404))));
    await settle();
    expect(el.querySelector('td-not-found h2')?.textContent).toBe('Race not found');
    expect(el.querySelector('td-not-found strong')?.textContent).toBe('ABC123');
    const router = TestBed.inject(Router);
    el.querySelector<HTMLButtonElement>('td-not-found button')!.click();
    await settle();
    expect(router.url).toBe('/');
  });

  it('shows the start countdown before the off, and the ticker once live', async () => {
    const { el, settle } = await setup((api) => api.next.push(() => Promise.resolve(race({ status: 'pending', start_time: T1 }))));
    await settle();
    expect(el.querySelector('td-pending-banner')).not.toBeNull();
    expect(el.querySelector('td-ticker')).toBeNull();
    await settle(60_000);
    expect(el.querySelector('td-pending-banner')).toBeNull();
    expect(el.querySelector('td-ticker')).not.toBeNull();
  });

  it('swaps to the finished screen and stops polling once the race is over', async () => {
    const { el, api, settle } = await setup((api) => api.next.push(() => Promise.resolve(race({ status: 'finished' }))));
    await settle();
    expect(el.querySelector('td-finished')).not.toBeNull();
    expect(el.querySelector('td-race-track')).toBeNull();
    await settle(180_000);
    expect(api.raceCalls).toBe(1);
    expect(api.seriesCalls).toBe(1);
  });

  it('navigates home and to the org from the header', async () => {
    const { el, settle } = await setup((api) => api.next.push(() => Promise.resolve(race({ organisation_name: 'Acme' }))));
    await settle();
    const router = TestBed.inject(Router);
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('td-race-header button')];
    buttons.find((b) => b.textContent?.includes('Acme'))!.click();
    await settle();
    expect(router.url).toBe('/org/Acme');
    buttons.find((b) => b.textContent?.includes('Home'))!.click();
    await settle();
    expect(router.url).toBe('/');
  });

  describe('graphs', () => {
    const openGraphs = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>('td-race-header button')].find((b) => b.textContent?.trim() === 'Graphs')!.click();

    it('does not fetch the series until opened, then charts it in a dialog', async () => {
      const { el, api, settle } = await setup();
      await settle();
      expect(api.seriesCalls).toBe(0);
      openGraphs(el);
      await settle();
      expect(api.seriesCalls).toBe(1);
      expect(document.querySelector('td-dialog td-race-graphs td-race-chart')).not.toBeNull();
    });

    it('refetches on each snapshot while open, and stops once closed', async () => {
      const { el, api, settle } = await setup();
      await settle();
      openGraphs(el);
      await settle();
      await settle(60_000);
      expect(api.seriesCalls).toBe(2);
      document.querySelector<HTMLButtonElement>('td-dialog button.close')!.click();
      await settle(60_000);
      expect(api.seriesCalls).toBe(2);
    });

    it('ignores a slow response that lands after a newer one', async () => {
      let slow!: (s: GetRaceSeriesResponse) => void;
      const { el, settle } = await setup((api) => {
        api.seriesNext.push(() => new Promise((r) => (slow = r)));
        api.seriesNext.push(() => Promise.resolve({ ...SERIES, horses: [] }));
      });
      await settle();
      openGraphs(el);
      await settle();
      await settle(60_000);
      slow(SERIES);
      await settle();
      expect(document.querySelector('td-race-graphs .message')?.textContent).toContain('No token data yet');
    });

    it('closes when the race finishes', async () => {
      const { el, settle } = await setup((api) => {
        api.next.push(() => Promise.resolve(race()));
        api.next.push(() => Promise.resolve(race({ status: 'finished' })));
      });
      await settle();
      openGraphs(el);
      await settle();
      await settle(60_000);
      expect(document.querySelector('td-dialog')).toBeNull();
    });
  });

  it('loads league standings once and folds them into the ticker', async () => {
    const league = { league_id: 'org', organisation_name: 'Acme', league_season: 2, league_division_names: ['Premier'],
      horses: [horse('a', { division: 1, current_tokens: 500 })] } as Partial<GetRaceResponse>;
    const { el, api, settle } = await setup((api) => {
      api.standingsResult = () => Promise.resolve({ standings: { org_name: 'Acme', season: 2, round: 1, races_per_season: 8,
        divisions: [{ division: 1, name: 'Premier', rows: [{ rank: 1, stable_horse_id: 's-a', horse_name: 'Horse a', user_name: 'U', points: 10, season_tokens: 5, zone: null }] }] } as SeasonStandings });
      api.next.push(() => Promise.resolve(race(league)));
      api.next.push(() => Promise.resolve(race(league)));
    });
    await settle();
    await settle(60_000);
    expect(api.standingsCalls).toBe(1);
    expect(el.querySelector('td-ticker')).not.toBeNull();
  });

  describe('on a finished league race', () => {
    const LEAGUE = { status: 'finished', league_id: 'org', organisation_name: 'Acme', league_season: 2, league_round: 3,
      league_division_names: ['Premier', 'Championship'],
      horses: ['a', 'b', 'c', 'd', 'e'].map((id, i) => horse(id, { division: (i % 2) + 1, final_scored_tokens: 500 - i * 50, rank: i + 1 })) } as Partial<GetRaceResponse>;
    // Five runners, so two sit below the podium and the board has a tab.
    const FIELD = ['a', 'b', 'c', 'd', 'e'].map((id, i) => horse(id, { rank: i + 1 }));
    const STANDINGS = { org_name: 'Acme', season: 2, round: 3, races_per_season: 8, divisions: [
      { division: 1, name: 'Premier', rows: [{ rank: 1, stable_horse_id: 's-a', horse_name: 'Horse a', user_name: 'U', points: 30, season_tokens: 900, zone: null }] },
      { division: 2, name: 'Championship', rows: [{ rank: 1, stable_horse_id: 's-b', horse_name: 'Horse b', user_name: 'V', points: 25, season_tokens: 700, zone: 'promote' }] },
    ] } as SeasonStandings;
    const tabs = (el: HTMLElement) => [...el.querySelectorAll('td-finished [role="tab"]')].map((t) => t.textContent?.trim());

    it('calls the board Overall and adds Divisions and Season before the charts', async () => {
      const { el, api, settle } = await setup((api) => {
        api.standingsResult = () => Promise.resolve({ standings: STANDINGS });
        api.next.push(() => Promise.resolve(race(LEAGUE)));
      });
      await settle();
      expect(tabs(el)).toEqual(['Overall', 'Divisions', 'Season', 'Cumulative tokens', 'Pace']);
      expect(api.standingsCalls).toBe(1);
    });

    it('leaves Season out when the standings fail to load', async () => {
      const { el, settle } = await setup((api) => {
        api.standingsResult = () => Promise.reject(new Error('down'));
        api.next.push(() => Promise.resolve(race(LEAGUE)));
      });
      await settle();
      expect(tabs(el)).toEqual(['Overall', 'Divisions', 'Cumulative tokens', 'Pace']);
    });

    it('leaves Season out once a later round exists, since the table no longer describes this race', async () => {
      const { el, settle } = await setup((api) => {
        api.standingsResult = () => Promise.resolve({ standings: { ...STANDINGS, round: 5 } });
        api.next.push(() => Promise.resolve(race(LEAGUE)));
      });
      await settle();
      expect(tabs(el)).toEqual(['Overall', 'Divisions', 'Cumulative tokens', 'Pace']);
    });

    it('keeps a normal race to Board and the charts', async () => {
      const { el, api, settle } = await setup((api) => api.next.push(() => Promise.resolve(race({ status: 'finished', horses: FIELD }))));
      await settle();
      expect(tabs(el)).toEqual(['Board', 'Cumulative tokens', 'Pace']);
      expect(api.standingsCalls).toBe(0);
    });
  });
});

