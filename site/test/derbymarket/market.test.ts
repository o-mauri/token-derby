import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderMarket } from '../../src/derbymarket/index.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const now = Date.now();
const live = { race_id: 'r9', name: 'League Race 9/10', join_code: 'Q79KSH',
  start_time: new Date(now - 7 * 3_600_000).toISOString(), end_time: new Date(now + 4 * 3_600_000).toISOString(), status: 'live' };
const finished = { ...live, status: 'finished', ended_at: new Date(now - 3_600_000).toISOString() };
const next = { race_id: 'r10', name: 'League Race 10/10', join_code: 'NEXT10',
  start_time: new Date(now + 13 * 3_600_000).toISOString(), end_time: new Date(now + 25 * 3_600_000).toISOString(), status: 'pending' };
const raceView = (status: string) => ({ ...live, status, tz: 'UTC', max_participants: 30, created_at: live.start_time,
  server_time: new Date(now).toISOString(), time_left_seconds: 600, organisation_name: 'StackOne',
  horses: [{ horse_id: 'h1', name: 'black & white', colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#000' },
    current_tokens: 10, scored_tokens: 10, rank: 1, user_name: 'Y', joined_at: live.start_time, last_heartbeat: live.start_time }] });
const snapshot = { race_id: 'r9', bucket: 1, computed_at: new Date(now).toISOString(), not_joined: [],
  prices: [{ horse_id: 'h1', joined: true, win: 0.97, podium: 1, division: null, divisionPodium: null }] };

type Routes = Record<string, () => Response | Promise<Response>>;
function stubFetch(routes: Routes) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const path = new URL(String(url), 'http://localhost').pathname;
    const handler = routes[path];
    if (!handler) return json({ code: 'NOT_FOUND', message: path }, 404);
    return handler();
  }));
}

beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('renderMarket — org board', () => {
  it('shows the loader with no org name until the races arrive, then the live board', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    stubFetch({
      '/api/organisations/stackone/races': async () => { await gate; return json({ org_name: 'StackOne', races: [live, next] }); },
      '/api/races/Q79KSH': () => json(raceView('live')),
      '/api/races/Q79KSH/markets': () => json({ open: true, snapshot, horses: [] }),
    });
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'org', orgName: 'stackone' });
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.loader')).not.toBeNull();
    expect(root.textContent).not.toContain('stackone');

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.loader')).toBeNull();
    expect(root.querySelector('.dm-brand')!.textContent).toContain('StackOne');
    expect(root.textContent).toContain('black & white');
    dispose();
  });

  it('does not bring the loader back when the board refreshes', async () => {
    stubFetch({
      '/api/organisations/stackone/races': () => json({ org_name: 'StackOne', races: [live] }),
      '/api/races/Q79KSH': () => json(raceView('live')),
      '/api/races/Q79KSH/markets': () => json({ open: true, snapshot, horses: [] }),
    });
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'org', orgName: 'stackone' });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(root.querySelector('.loader')).toBeNull();
    expect(root.querySelector('.dm-row')).not.toBeNull();
    dispose();
  });

  it('keeps the board on screen when a later poll fails', async () => {
    let marketsOk = true;
    stubFetch({
      '/api/organisations/stackone/races': () => json({ org_name: 'StackOne', races: [live] }),
      '/api/races/Q79KSH': () => json(raceView('live')),
      '/api/races/Q79KSH/markets': () => (marketsOk ? json({ open: true, snapshot, horses: [] }) : json({ code: 'X', message: 'x' }, 500)),
    });
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'org', orgName: 'stackone' });
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.dm-row')).not.toBeNull();
    marketsOk = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(root.querySelector('.dm-row')).not.toBeNull();
    marketsOk = true;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(root.querySelector('.dm-row')).not.toBeNull();
    dispose();
  });

  it('shows the last race\'s final prices and the next race between races', async () => {
    stubFetch({
      '/api/organisations/stackone/races': () => json({ org_name: 'StackOne', races: [finished, next] }),
      '/api/races/Q79KSH': () => json(raceView('finished')),
      '/api/races/Q79KSH/markets/history': () => json({ history: [snapshot] }),
    });
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'org', orgName: 'stackone' });
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.dm-next')!.textContent).toContain('League Race 10/10');
    expect(root.textContent).toContain('final prices');
    dispose();
  });

  it('says an org that has never raced has no races yet', async () => {
    stubFetch({ '/api/organisations/quiet/races': () => json({ org_name: 'Quiet', races: [] }) });
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'org', orgName: 'quiet' });
    await vi.advanceTimersByTimeAsync(0);
    expect(root.textContent).toContain('No races yet for Quiet');
    dispose();
  });

  it('names an unknown org', async () => {
    stubFetch({});
    const root = document.createElement('div');
    renderMarket(root, { type: 'org', orgName: 'acme' }, { hostname: 'market.tokenderby.co.uk' });
    await vi.advanceTimersByTimeAsync(0);
    expect(root.textContent).toContain("There's no organisation called acme");
  });
});

describe('renderMarket — one race', () => {
  it('moves a join code that belongs to another org to that org\'s path', async () => {
    const replacePath = vi.fn();
    stubFetch({
      '/api/organisations/acme/races': () => json({ org_name: 'Acme', races: [] }),
      '/api/races/Q79KSH': () => json(raceView('live')),
      '/api/organisations/StackOne/races': () => json({ org_name: 'StackOne', races: [live] }),
      '/api/races/Q79KSH/markets': () => json({ open: true, snapshot, horses: [] }),
    });
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'race', orgName: 'acme', joinCode: 'Q79KSH' },
      { replacePath, hostname: 'market.tokenderby.co.uk' });
    await vi.advanceTimersByTimeAsync(0);
    expect(replacePath).toHaveBeenCalledWith('/StackOne/Q79KSH');
    expect(root.querySelector('.dm-brand')!.textContent).toContain('StackOne');
    dispose();
  });
});

describe('renderMarket — wrong-org and recovery', () => {
  const home = () => ({
    '/api/organisations/acme/races': () => json({ org_name: 'Acme', races: [] }),
    '/api/races/Q79KSH': () => json(raceView('live')),
  });

  it('moves once, then shows not-found if the real org still lacks the code', async () => {
    const replacePath = vi.fn();
    stubFetch({ ...home(), '/api/organisations/StackOne/races': () => json({ org_name: 'StackOne', races: [] }) });
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'race', orgName: 'acme', joinCode: 'Q79KSH' },
      { replacePath, hostname: 'market.tokenderby.co.uk' });
    await vi.advanceTimersByTimeAsync(0);
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(replacePath).toHaveBeenCalledTimes(1);
    expect(calls).toBeLessThanOrEqual(5);
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    expect(root.textContent).toContain('There is nothing here.');
    dispose();
  });

  it('shows not-found when the race names no organisation', async () => {
    stubFetch({ ...home(), '/api/races/Q79KSH': () => json({ ...raceView('live'), organisation_name: undefined }) });
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'race', orgName: 'acme', joinCode: 'Q79KSH' },
      { replacePath: vi.fn(), hostname: 'market.tokenderby.co.uk' });
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.dm-empty')).not.toBeNull();
    expect(root.querySelector('.loader')).toBeNull();
    dispose();
  });

  it('keeps polling after a transient failure looking up the race', async () => {
    let fail = true;
    stubFetch({
      ...home(),
      '/api/races/Q79KSH': () => (fail ? json({ code: 'X', message: 'boom' }, 500) : json(raceView('live'))),
      '/api/organisations/StackOne/races': () => json({ org_name: 'StackOne', races: [live] }),
      '/api/races/Q79KSH/markets': () => json({ open: true, snapshot, horses: [] }),
    });
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'race', orgName: 'acme', joinCode: 'Q79KSH' },
      { replacePath: vi.fn(), hostname: 'market.tokenderby.co.uk' });
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.dm-row')).toBeNull();
    fail = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(root.querySelector('.dm-row')).not.toBeNull();
    dispose();
  });
});

describe('renderMarket — chart and polling', () => {
  const board = (extra: Routes = {}) => ({
    '/api/organisations/stackone/races': () => json({ org_name: 'StackOne', races: [live] }),
    '/api/races/Q79KSH': () => json(raceView('live')),
    '/api/races/Q79KSH/markets': () => json({ open: true, snapshot, horses: [] }),
    ...extra,
  });
  const fetchCount = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

  it('brings the board back after a failed history load', async () => {
    stubFetch(board({ '/api/races/Q79KSH/markets/history': () => json({ code: 'X', message: 'no' }, 500) }));
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'org', orgName: 'stackone' });
    await vi.advanceTimersByTimeAsync(0);
    root.querySelector<HTMLButtonElement>('.dm-row')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.dm-row')).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(root.querySelector('.dm-row')).not.toBeNull();
    dispose();
  });

  it('pauses polling while a chart is open and resumes after Back', async () => {
    stubFetch(board({ '/api/races/Q79KSH/markets/history': () => json({ history: [snapshot] }) }));
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'org', orgName: 'stackone' });
    await vi.advanceTimersByTimeAsync(0);
    root.querySelector<HTMLButtonElement>('.dm-row')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.dm-pc')).not.toBeNull();
    const before = fetchCount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchCount()).toBe(before);
    expect(root.querySelector('.dm-pc')).not.toBeNull();
    root.querySelector<HTMLButtonElement>('.dm-pc-back')!.click();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchCount()).toBeGreaterThan(before);
    expect(root.querySelector('.dm-row')).not.toBeNull();
    dispose();
  });

  it('renders nothing after dispose when a pending fetch resolves', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    stubFetch(board({
      '/api/organisations/stackone/races': async () => { await gate; return json({ org_name: 'StackOne', races: [live] }); },
    }));
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'org', orgName: 'stackone' });
    await vi.advanceTimersByTimeAsync(0);
    const html = root.innerHTML;
    dispose();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.innerHTML).toBe(html);
  });
});

describe('renderMarket — picker', () => {
  it('shows the signed-out picker without a session', async () => {
    stubFetch({});
    const root = document.createElement('div');
    renderMarket(root, { type: 'picker' });
    await vi.advanceTimersByTimeAsync(0);
    expect(root.textContent).toContain('token-derby derbymarket');
  });

  it('shows the signed-out picker when the session has expired', async () => {
    localStorage.setItem('td_market_session', 'stale');
    stubFetch({ '/api/organisations': () => json({ code: 'UNAUTHORIZED', message: 'expired' }, 401) });
    const root = document.createElement('div');
    renderMarket(root, { type: 'picker' });
    await vi.advanceTimersByTimeAsync(0);
    expect(root.textContent).toContain('token-derby derbymarket');
  });

  it('goes straight to the only org with a live race', async () => {
    localStorage.setItem('td_market_session', 'good');
    const navigate = vi.fn();
    const forward = vi.fn();
    stubFetch({
      '/api/organisations': () => json({ organisations: [{ org_id: 'o1', org_name: 'StackOne' }] }),
      '/api/organisations/StackOne/races': () => json({ org_name: 'StackOne', races: [live] }),
    });
    const root = document.createElement('div');
    renderMarket(root, { type: 'picker' }, { navigate, forward, hostname: 'market.tokenderby.co.uk' });
    await vi.advanceTimersByTimeAsync(0);
    expect(forward).toHaveBeenCalledWith('/StackOne');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows the loader while organisations load', async () => {
    localStorage.setItem('td_market_session', 'good');
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    stubFetch({ '/api/organisations': async () => { await gate; return json({ organisations: [] }); } });
    const root = document.createElement('div');
    renderMarket(root, { type: 'picker' });
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.loader')).not.toBeNull();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.loader')).toBeNull();
  });
});

describe('renderMarket — price chart', () => {
  it('shows the loader while a market\'s history loads', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    stubFetch({
      '/api/organisations/stackone/races': () => json({ org_name: 'StackOne', races: [live] }),
      '/api/races/Q79KSH': () => json(raceView('live')),
      '/api/races/Q79KSH/markets': () => json({ open: true, snapshot, horses: [] }),
      '/api/races/Q79KSH/markets/history': async () => { await gate; return json({ history: [snapshot] }); },
    });
    const root = document.createElement('div');
    const dispose = renderMarket(root, { type: 'org', orgName: 'stackone' });
    await vi.advanceTimersByTimeAsync(0);
    root.querySelector<HTMLButtonElement>('.dm-row')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.loader')).not.toBeNull();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.loader')).toBeNull();
    expect(root.querySelector('.dm-pc')).not.toBeNull();
    dispose();
  });
});
