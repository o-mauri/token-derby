import { TestBed } from '@angular/core/testing';
import type { GetRaceResponse, ListOrgRacesResponse, RaceSummary } from '@token-derby/shared';
import { ApiError } from '@token-derby/ui';
import { RaceApi } from '../race/race-api';
import { OrgApi } from './org-api';
import { OrgData } from './org-data';

const summary = (code: string, status: RaceSummary['status'], startInMs = 0): RaceSummary => ({
  race_id: code, name: code, join_code: code, status,
  start_time: new Date(Date.now() + startInMs).toISOString(), end_time: new Date(Date.now() + startInMs + 3600_000).toISOString(),
} as RaceSummary);

class FakeOrgApi {
  racesCalls = 0; standingsCalls = 0;
  racesResult: () => Promise<ListOrgRacesResponse> = () => Promise.resolve({ org_name: 'Acme', races: [] });
  races() { this.racesCalls++; return this.racesResult(); }
  standings() { this.standingsCalls++; return Promise.resolve({ standings: null }); }
}
class FakeRaceApi {
  calls = 0;
  result: () => Promise<GetRaceResponse> = () => Promise.resolve({ join_code: 'LIVE', status: 'live', horses: [] } as unknown as GetRaceResponse);
  race() { this.calls++; return this.result(); }
}

async function setup(prime: (org: FakeOrgApi, race: FakeRaceApi) => void = () => undefined) {
  const org = new FakeOrgApi();
  const race = new FakeRaceApi();
  prime(org, race);
  // Provided like the org route provides it, so its polls are ordinary root effects.
  TestBed.configureTestingModule({ providers: [OrgData, { provide: OrgApi, useValue: org }, { provide: RaceApi, useValue: race }] });
  const data = TestBed.inject(OrgData);
  data.name.set('Acme');
  const settle = async (ms = 0) => { TestBed.tick(); await vi.advanceTimersByTimeAsync(ms); TestBed.tick(); };
  // The live race's poll is scheduled only once the races show a live one. Each round advances 1ms because
  // the fake clock files a 0ms timer just after "now", so advancing by 0 can miss it.
  for (let i = 0; i < 3; i++) await settle(1);
  return { data, org, race, settle };
}

describe('OrgData', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('loads the races and standings once the name is set', async () => {
    const { data, org } = await setup();
    expect(org.racesCalls).toBe(1);
    expect(org.standingsCalls).toBe(1);
    expect(data.races()?.org_name).toBe('Acme');
  });

  it('polls every minute while a race is live, and loads the live race', async () => {
    const { org, race, data, settle } = await setup((o) => (o.racesResult = () => Promise.resolve({ org_name: 'Acme', races: [summary('LIVE', 'live')] })));
    expect(race.calls).toBe(1);
    expect(data.liveRace()?.join_code).toBe('LIVE');
    await settle(60_000);
    expect(org.racesCalls).toBe(2);
  });

  it('polls every ten minutes when nothing is live or starting within the hour', async () => {
    const { org, race, settle } = await setup((o) => (o.racesResult = () => Promise.resolve({ org_name: 'Acme', races: [summary('LATER', 'pending', 3 * 3600_000)] })));
    await settle(60_000);
    expect(org.racesCalls).toBe(1);
    await settle(9 * 60_000);
    expect(org.racesCalls).toBe(2);
    expect(race.calls).toBe(0);
  });

  it('flags an unknown org', async () => {
    const { data } = await setup((o) => (o.racesResult = () => Promise.reject(new ApiError('ORG_NOT_FOUND', 'nope', 404))));
    expect(data.notFound()).toBe(true);
  });

  it('flags other failures without hiding races it already had', async () => {
    let fail = false;
    const { data, settle } = await setup((o) => (o.racesResult = () => (fail ? Promise.reject(new ApiError('NETWORK_ERROR', 'x', 0)) : Promise.resolve({ org_name: 'Acme', races: [summary('LIVE', 'live')] }))));
    fail = true;
    await settle(60_000);
    expect(data.races()?.races).toHaveLength(1);
    expect(data.racesFailed()).toBe(false);
  });

  it('keeps the races when the live race fails to load', async () => {
    const { data } = await setup((o, r) => {
      o.racesResult = () => Promise.resolve({ org_name: 'Acme', races: [summary('LIVE', 'live')] });
      r.result = () => Promise.reject(new ApiError('NETWORK_ERROR', 'x', 0));
    });
    expect(data.races()?.races).toHaveLength(1);
    expect(data.liveRace()).toBeNull();
  });

  it('drops the previous org\u2019s data the moment the name changes', async () => {
    const { data } = await setup((o) => (o.racesResult = () => Promise.resolve({ org_name: 'Acme', races: [summary('LIVE', 'live')] })));
    expect(data.races()?.org_name).toBe('Acme');
    data.name.set('Other');
    TestBed.tick();
    expect(data.races()).toBeUndefined();
    expect(data.loading()).toBe(true);
  });
});
