import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { ListOrgRacesResponse, RaceSummary, SeasonStandings } from '@token-derby/shared';
import { RESIZE_OBSERVER, apiErrors } from '@token-derby/ui';
import { By } from '@angular/platform-browser';
import { routes } from '../app.routes';
import { OrgData } from './org-data';
import { OrgShell } from './org-shell';

const C = { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' };
const at = (days: number, hour = 9) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
const race = (code: string, status: RaceSummary['status'], days: number, extra: Partial<RaceSummary> = {}): RaceSummary => ({
  race_id: code, name: `Race ${code}`, join_code: code, status, start_time: at(days), end_time: at(days, 17), ...extra,
} as RaceSummary);
const RACES: ListOrgRacesResponse = {
  org_name: 'Acme',
  races: [
    race('K7QX', 'live', 0, { time_left_seconds: 3600, highlight: { horse_name: 'Gallopz', tokens: 4_210_000, colors: C }, runners: 6 }),
    race('NEXT', 'pending', 2),
    race('OLD1', 'finished', -3, { highlight: { horse_name: 'Hay Girl', tokens: 12_100_000, colors: C }, runners: 11, total_tokens: 61_200_000 }),
    race('OLD2', 'finished', -40, { highlight: { horse_name: 'Gallopz', tokens: 9_000_000, colors: C } }),
  ],
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function open(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes, withComponentInputBinding()),
      provideHttpClient(withInterceptors([apiErrors])),
      provideHttpClientTesting(),
      { provide: RESIZE_OBSERVER, useValue: null },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const http = TestBed.inject(HttpTestingController);
  const settle = async () => { for (let i = 0; i < 3; i++) { await tick(); await harness.fixture.whenStable(); } };
  await settle();
  return { harness, http, settle, el: () => harness.routeNativeElement as HTMLElement };
}

/** Answers the org's races and standings, and the live race if it's asked for. */
function answer(http: HttpTestingController, races: ListOrgRacesResponse | 'missing' | 'down' = RACES, standings: 'none' | 'down' | 'later' = 'none') {
  const req = http.expectOne('/api/organisations/Acme/races');
  if (races === 'missing') req.flush({ code: 'ORG_NOT_FOUND', message: 'No organisation' }, { status: 404, statusText: 'Not Found' });
  else if (races === 'down') req.error(new ProgressEvent('error'));
  else req.flush(races);
  if (standings === 'later') return;
  http.match('/api/organisations/Acme/league/standings').forEach((r) =>
    standings === 'down' ? r.flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'Error' }) : r.flush({ standings: null }));
}

describe('OrgPage', () => {
  it('shows the loader until the races arrive, with the name blank', async () => {
    const { el } = await open('/org/Acme');
    // The page element is the shell's child.
    expect(el().querySelector('td-loader')).not.toBeNull();
    expect(el().querySelector('.org-name')?.textContent?.trim() ?? '').toBe('');
  });

  it('lays out the panels, linking LIVE to the race and RACES to the races page', async () => {
    const { el, http, settle } = await open('/org/Acme');
    answer(http);
    await settle();
    http.match('/api/races/K7QX').forEach((r) => r.flush({ join_code: 'K7QX', status: 'live', time_left_seconds: 3600, horses: [] }));
    await settle();
    const page = el();
    expect(page.querySelector('td-crumbs .org-name.here')?.textContent?.trim()).toBe('Acme');
    expect(page.querySelector('td-panel.live a')?.getAttribute('href')).toBe('/race/K7QX');
    expect(page.querySelector('td-panel.races a')?.getAttribute('href')).toBe('/org/Acme/races');
    expect(page.querySelector('td-panel.league a')).toBeNull();
    expect(page.querySelector('td-panel.market')?.classList.contains('disabled')).toBe(true);
    expect(page.textContent).not.toContain('TV view');
  });

  it('shows not-found for an unknown org', async () => {
    const { el, http, settle } = await open('/org/Acme');
    answer(http, 'missing');
    await settle();
    expect(el().querySelector('td-not-found h2')?.textContent).toBe('Organisation not found');
    expect(el().querySelector('td-not-found strong')?.textContent).toBe('Acme');
  });

  it('keeps LEAGUE and says so inside the race panels when the races fail to load', async () => {
    const { el, http, settle } = await open('/org/Acme');
    answer(http, 'down');
    await settle();
    expect(el().querySelectorAll('.failed').length).toBe(3);
    expect(el().querySelector('td-panel.league td-org-league-panel')).not.toBeNull();
  });
});

describe('OrgPage data lifetime and league states', () => {
  it('gives each visit to an org its own data, so nothing polls or lingers after leaving', async () => {
    const { harness, http, settle } = await open('/org/Acme');
    answer(http);
    await settle();
    const shell = () => harness.fixture.debugElement.query(By.directive(OrgShell));
    const first = shell().injector.get(OrgData);
    await harness.navigateByUrl('/');
    await harness.navigateByUrl('/org/Acme');
    await settle();
    expect(shell().injector.get(OrgData)).not.toBe(first);
  });

  it('keeps one central loader, and no panels, until the standings and the live race answer', async () => {
    const { el, http, settle } = await open('/org/Acme');
    const onlyLoader = () => el().querySelector('td-loader') !== null && el().querySelector('td-panel') === null;
    answer(http, RACES, 'later');
    await settle();
    expect(onlyLoader()).toBe(true);
    http.match('/api/organisations/Acme/league/standings').forEach((r) => r.flush({ standings: null }));
    await settle();
    expect(onlyLoader()).toBe(true);
    http.match('/api/races/K7QX').forEach((r) => r.flush({ join_code: 'K7QX', status: 'live', time_left_seconds: 3600, horses: [] }));
    await settle();
    expect(el().querySelector('td-loader')).toBeNull();
    expect(el().querySelectorAll('td-panel').length).toBeGreaterThan(0);
  });

  it('says so inside LEAGUE when the standings fail to load', async () => {
    const { el, http, settle } = await open('/org/Acme');
    answer(http, RACES, 'down');
    await settle();
    http.match('/api/races/K7QX').forEach((r) => r.flush({ join_code: 'K7QX', status: 'live', time_left_seconds: 3600, horses: [] }));
    await settle();
    expect(el().querySelector('td-panel.league .failed')?.textContent).toContain("Couldn't load the league");
  });
});

describe('RacesPage', () => {
  it('lists the live and upcoming races and the latest month, every row a link', async () => {
    const { el, http, settle } = await open('/org/Acme/races');
    answer(http);
    await settle();
    const hrefs = [...el().querySelectorAll('td-race-list a.row')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/race/K7QX', '/race/NEXT', '/race/OLD1']);
    // The org's crumb and the back button both lead back to the dashboard.
    expect(el().querySelector('td-crumbs a.part.org-name')?.getAttribute('href')).toBe('/org/Acme');
    expect(el().querySelector('td-crumbs .here')?.textContent?.trim()).toBe('Races');
    expect(el().querySelector('a.back')?.textContent?.trim()).toBe('← Acme');
    expect(el().querySelector('a.back')?.getAttribute('href')).toBe('/org/Acme');
  });

  it('falls back to the latest month for a month it does not have', async () => {
    const { el, http, settle } = await open('/org/Acme/races?month=abc');
    answer(http);
    await settle();
    expect(el().querySelector('td-race-list a.row[href="/race/OLD1"]')).not.toBeNull();
  });

  it('opens the month named in the query string', async () => {
    const old = new Date(RACES.races[3]!.start_time);
    const key = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}`;
    const { el, http, settle } = await open(`/org/Acme/races?month=${key}`);
    answer(http);
    await settle();
    expect(el().querySelector('td-race-list a.row[href="/race/OLD2"]')).not.toBeNull();
    expect(el().querySelector('td-race-list a.row[href="/race/OLD1"]')).toBeNull();
  });

  it('says so when the org has no races yet', async () => {
    const { el, http, settle } = await open('/org/Acme/races');
    answer(http, { org_name: 'Acme', races: [] });
    await settle();
    expect(el().querySelector('.empty')?.textContent).toContain('No races yet');
  });
});

describe('LeaguePage', () => {
  const row = (rank: number, name: string, points: number) => ({ rank, stable_horse_id: `s-${name}`, horse_name: name, user_name: 'o', points, season_tokens: 0, zone: null });
  const season = (n: number): SeasonStandings => ({
    org_name: 'Acme', season: n, round: n === 3 ? 6 : 10, races_per_season: 10,
    divisions: ['Premier', 'Championship', 'League One'].map((name, i) => ({ division: i + 1, name, rows: [row(1, `${name}-lead-${n}`, 40), row(2, `${name}-two-${n}`, 30)] })),
  });

  /** Answers the shared org requests: races, and the current season's standings (or no league). */
  function answerOrg(http: HttpTestingController, current: SeasonStandings | null = season(3)) {
    http.expectOne('/api/organisations/Acme/races').flush(RACES);
    http.expectOne('/api/organisations/Acme/league/standings').flush({ standings: current });
  }

  it('shows the current season: progress and a column per division', async () => {
    const { el, http, settle } = await open('/org/Acme/league');
    expect(el().querySelector('td-loader')).not.toBeNull();
    answerOrg(http);
    await settle();
    expect(el().querySelector('[data-page]')?.getAttribute('data-page') ?? el().getAttribute('data-page')).toBe('org-league');
    expect(el().querySelector('td-season-pager .label')?.textContent?.trim()).toBe('SEASON 3');
    expect(el().querySelector('td-season-pager .progress')?.textContent).toContain('Round 6 of 10');
    expect(el().querySelector('td-crumbs a.part.org-name')?.getAttribute('href')).toBe('/org/Acme');
    expect(el().querySelector('a.back')?.textContent?.trim()).toBe('← Acme');
    expect(el().querySelector('a.back')?.getAttribute('href')).toBe('/org/Acme');
    expect(el().querySelectorAll('td-league-table')).toHaveLength(3);
  });

  it('fetches a past season named in the query string and shows it final, with its champion', async () => {
    const { el, http, settle } = await open('/org/Acme/league?season=2');
    answerOrg(http);
    await settle();
    http.expectOne('/api/organisations/Acme/league/standings?season=2').flush({ standings: season(2) });
    await settle();
    expect(el().querySelector('td-season-pager .final')).not.toBeNull();
    expect(el().querySelector('td-season-pager .champion')?.textContent).toContain('Premier-lead-2');
  });

  it('shows the current season for a season it does not have, without asking for it', async () => {
    const { el, http, settle } = await open('/org/Acme/league?season=abc');
    answerOrg(http);
    await settle();
    http.expectNone((r) => r.url.includes('season='));
    expect(el().querySelector('td-season-pager .label')?.textContent?.trim()).toBe('SEASON 3');
  });

  it('says so when the org runs no league, and never asks for an old season', async () => {
    const { el, http, settle } = await open('/org/Acme/league?season=2');
    answerOrg(http, null);
    await settle();
    http.expectNone((r) => r.url.includes('season='));
    expect(el().querySelector('.message')?.textContent).toContain("Acme doesn't run a league.");
    expect(el().querySelector('.message a')?.getAttribute('href')).toBe('/org/Acme');
  });

  it('keeps the season switcher when an old season fails to load', async () => {
    const { el, http, settle } = await open('/org/Acme/league?season=2');
    answerOrg(http);
    await settle();
    http.expectOne('/api/organisations/Acme/league/standings?season=2').flush({ code: 'INTERNAL', message: 'x' }, { status: 500, statusText: 'Error' });
    await settle();
    expect(el().querySelector('.message')?.textContent).toContain("Couldn't load the league");
    expect(el().querySelector('td-season-pager')).not.toBeNull();
  });

  it('shows not-found for an unknown org', async () => {
    const { el, http, settle } = await open('/org/Acme/league');
    http.expectOne('/api/organisations/Acme/races').flush({ code: 'ORG_NOT_FOUND', message: 'x' }, { status: 404, statusText: 'Not Found' });
    http.match('/api/organisations/Acme/league/standings').forEach((r) => r.flush({ standings: null }));
    await settle();
    expect(el().querySelector('td-not-found h2')?.textContent).toBe('Organisation not found');
  });

  it('is linked from the dashboard\u2019s LEAGUE panel', async () => {
    const { el, http, settle } = await open('/org/Acme');
    answerOrg(http);
    await settle();
    http.match('/api/races/K7QX').forEach((r) => r.flush({ join_code: 'K7QX', status: 'live', time_left_seconds: 3600, horses: [] }));
    await settle();
    expect(el().querySelector('td-panel.league a')?.getAttribute('href')).toBe('/org/Acme/league');
  });
});

