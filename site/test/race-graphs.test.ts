import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRaceGraphs } from '../src/render/race-graphs.js';
import type { GetRaceResponse, GetRaceSeriesResponse, HorseView } from '@token-derby/shared';

const COLORS = { body: '#4db8ff', mane: '#000', tail: '#000', saddle: '#f00' };

function horse(id: string, name: string, rank: number, division?: number): HorseView {
  return {
    horse_id: id, stable_horse_id: `s-${id}`, name, colors: COLORS,
    current_tokens: 100, last_heartbeat: '', joined_at: '', rank,
    ...(division === undefined ? {} : { division }),
  } as HorseView;
}

function race(over: Partial<GetRaceResponse> = {}): GetRaceResponse {
  return {
    name: 'Test Race', status: 'live', time_left_seconds: 600,
    horses: [horse('a', 'Alpha', 1), horse('b', 'Beta', 2)],
    ...over,
  } as GetRaceResponse;
}

const series: GetRaceSeriesResponse = {
  start_ms: 0, end_ms: 600_000,
  horses: [
    { horse_id: 'a', points: [{ t: 60_000, d: 40 }, { t: 120_000, d: 60 }] },
    { horse_id: 'b', points: [{ t: 60_000, d: 10 }, { t: 120_000, d: 20 }] },
  ],
};

function setup(over: { fetchSeries?: any; now?: () => number } = {}) {
  const fetchSeries = over.fetchSeries ?? vi.fn(async () => series);
  const g = createRaceGraphs({
    doc: document, joinCode: 'ABC123',
    fetchSeries, now: over.now ?? (() => 180_000),
  });
  document.body.appendChild(g.button);
  return { g, fetchSeries };
}

describe('race graphs popup', () => {
  it('does not fetch until opened', () => {
    const { fetchSeries } = setup();
    expect(fetchSeries).not.toHaveBeenCalled();
  });

  it('fetches once and renders a chart when opened', async () => {
    const { g, fetchSeries } = setup();
    g.onSnapshot(race());
    g.button.click();
    await vi.waitFor(() => {
      expect(document.querySelector('.race-graphs .chart-svg')).toBeTruthy();
    });
    expect(fetchSeries).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('does not fetch on a snapshot while closed', () => {
    const { g, fetchSeries } = setup();
    g.onSnapshot(race());
    g.onSnapshot(race());
    expect(fetchSeries).not.toHaveBeenCalled();
    g.destroy();
  });

  it('refetches on each snapshot while open', async () => {
    const { g, fetchSeries } = setup();
    g.onSnapshot(race());
    g.button.click();
    await vi.waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(1));
    g.onSnapshot(race());
    await vi.waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(2));
    g.destroy();
  });

  it('stops refetching once closed', async () => {
    const { g, fetchSeries } = setup();
    g.onSnapshot(race());
    g.button.click();
    await vi.waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(1));
    document.querySelector<HTMLButtonElement>('.race-graphs-close')!.click();
    g.onSnapshot(race());
    expect(fetchSeries).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('closes on Escape and on backdrop click', async () => {
    const { g } = setup();
    g.onSnapshot(race());
    g.button.click();
    await vi.waitFor(() => expect(document.querySelector('.race-graphs')).toBeTruthy());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.race-graphs')).toBeNull();

    g.button.click();
    await vi.waitFor(() => expect(document.querySelector('.race-graphs')).toBeTruthy());
    document.querySelector<HTMLElement>('.race-graphs-backdrop')!.click();
    expect(document.querySelector('.race-graphs')).toBeNull();
    g.destroy();
  });

  it('discards an in-flight response that arrives after closing', async () => {
    let release: (v: GetRaceSeriesResponse) => void = () => {};
    const fetchSeries = vi.fn(() => new Promise<GetRaceSeriesResponse>((res) => { release = res; }));
    const { g } = setup({ fetchSeries });
    g.onSnapshot(race());
    g.button.click();
    await vi.waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(1));
    document.querySelector<HTMLButtonElement>('.race-graphs-close')!.click();
    release(series);                    // resolves after close
    await Promise.resolve();
    expect(document.querySelector('.race-graphs')).toBeNull();
    expect(document.querySelector('.chart-svg')).toBeNull();
    g.destroy();
  });

  it('renders the newer response when two overlapping loads resolve out of order', async () => {
    // Distinguish "older" from "newer" by data shape: the older response has no
    // points (renders the empty message), the newer one has points (renders a
    // chart) — so which one "won" is directly observable in the DOM.
    const olderSeries: GetRaceSeriesResponse = {
      start_ms: 0, end_ms: 600_000,
      horses: [{ horse_id: 'a', points: [] }, { horse_id: 'b', points: [] }],
    };
    const resolvers: Array<(v: GetRaceSeriesResponse) => void> = [];
    const fetchSeries = vi.fn(() => new Promise<GetRaceSeriesResponse>((res) => { resolvers.push(res); }));
    const { g } = setup({ fetchSeries });
    g.onSnapshot(race());
    g.button.click();                             // load #1 (older) in flight
    await vi.waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(1));
    g.onSnapshot(race());                         // load #2 (newer) in flight; #1's controller is aborted
    await vi.waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(2));

    resolvers[1]!(series);                        // newer resolves first
    await vi.waitFor(() => expect(document.querySelector('.chart-svg')).toBeTruthy());

    resolvers[0]!(olderSeries);                   // stale response arrives after — must be discarded
    await Promise.resolve();
    expect(document.querySelector('.chart-svg')).toBeTruthy();
    expect(document.querySelector('.race-graphs-empty')).toBeNull();
    g.destroy();
  });

  it('destroy removes the dialog and stops refreshing', async () => {
    const { g, fetchSeries } = setup();
    g.onSnapshot(race());
    g.button.click();
    await vi.waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(1));
    g.destroy();
    expect(document.querySelector('.race-graphs')).toBeNull();
    g.onSnapshot(race());
    expect(fetchSeries).toHaveBeenCalledTimes(1);
  });

  it('renders two tabs with cumulative active by default', async () => {
    const { g } = setup();
    g.onSnapshot(race());
    g.button.click();
    await vi.waitFor(() => expect(document.querySelector('.race-graphs-tab')).toBeTruthy());
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.race-graphs-tab'));
    expect(tabs.map((t) => t.dataset.mode)).toEqual(['cumulative', 'throughput']);
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    g.destroy();
  });

  it('switching tab re-renders without refetching', async () => {
    const { g, fetchSeries } = setup();
    g.onSnapshot(race());
    g.button.click();
    await vi.waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(1));
    expect(document.querySelector('.chart-title')!.textContent).toContain('Cumulative');

    document.querySelector<HTMLButtonElement>('.race-graphs-tab[data-mode="throughput"]')!.click();
    expect(document.querySelector('.chart-title')!.textContent).toContain('Tokens / min');
    expect(fetchSeries).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  it('renders no division buttons for a non-league race', async () => {
    const { g } = setup();
    g.onSnapshot(race());   // no league_division_names
    g.button.click();
    await vi.waitFor(() => expect(document.querySelector('.chart-svg')).toBeTruthy());
    expect(document.querySelectorAll('.race-graphs-div')).toHaveLength(0);
    g.destroy();
  });

  it('renders All plus one button per division, labelled from the league', async () => {
    const { g } = setup();
    g.onSnapshot(race({
      league_division_names: ['Premier', 'Championship'],
      horses: [horse('a', 'Alpha', 1, 1), horse('b', 'Beta', 2, 2)],
    }));
    g.button.click();
    await vi.waitFor(() => expect(document.querySelector('.race-graphs-div')).toBeTruthy());
    const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('.race-graphs-div'));
    expect(btns.map((b) => b.textContent)).toEqual(['All', 'Premier', 'Championship']);
    expect(btns.map((b) => b.dataset.division)).toEqual(['all', '1', '2']);
    expect(btns[0]!.getAttribute('aria-selected')).toBe('true');
    g.destroy();
  });

  it('selecting a division charts only that division, without refetching', async () => {
    const { g, fetchSeries } = setup();
    g.onSnapshot(race({
      league_division_names: ['Premier', 'Championship'],
      horses: [horse('a', 'Alpha', 1, 1), horse('b', 'Beta', 2, 2)],
    }));
    g.button.click();
    await vi.waitFor(() => expect(fetchSeries).toHaveBeenCalledTimes(1));
    expect(document.querySelectorAll('.legend-item')).toHaveLength(2);

    document.querySelector<HTMLButtonElement>('.race-graphs-div[data-division="1"]')!.click();
    const names = Array.from(document.querySelectorAll('.legend-item')).map((n) => n.textContent);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain('Alpha');
    expect(fetchSeries).toHaveBeenCalledTimes(1);
    g.destroy();
  });

  const emptySeries: GetRaceSeriesResponse = {
    start_ms: 0, end_ms: 600_000,
    horses: [{ horse_id: 'a', points: [] }, { horse_id: 'b', points: [] }],
  };

  it('shows a waiting message when the race has no points yet', async () => {
    const { g } = setup({ fetchSeries: vi.fn(async () => emptySeries) });
    g.onSnapshot(race());
    g.button.click();
    await vi.waitFor(() => expect(document.querySelector('.race-graphs-empty')).toBeTruthy());
    expect(document.querySelector('.race-graphs-empty')!.textContent)
      .toContain('No token data yet');
    g.destroy();
  });

  it('shows a loading message when opened before the first snapshot', async () => {
    const { g } = setup();
    g.button.click();                    // no onSnapshot yet — snapshot stays null
    await vi.waitFor(() => expect(document.querySelector('.race-graphs-empty')).toBeTruthy());
    expect(document.querySelector('.race-graphs-empty')!.textContent).toContain('Loading…');
    g.destroy();
  });

  it('shows the empty-division message when the selected division has runners but no points', async () => {
    const seriesNoPointsInDivision1: GetRaceSeriesResponse = {
      start_ms: 0, end_ms: 600_000,
      horses: [
        { horse_id: 'a', points: [] },
        { horse_id: 'b', points: [{ t: 60_000, d: 10 }] },
      ],
    };
    const { g } = setup({ fetchSeries: vi.fn(async () => seriesNoPointsInDivision1) });
    g.onSnapshot(race({
      league_division_names: ['Premier', 'Championship'],
      horses: [horse('a', 'Alpha', 1, 1), horse('b', 'Beta', 2, 2)],
    }));
    g.button.click();
    await vi.waitFor(() => expect(document.querySelector('.chart-svg')).toBeTruthy());   // All: b has points
    document.querySelector<HTMLButtonElement>('.race-graphs-div[data-division="1"]')!.click();
    expect(document.querySelector('.race-graphs-empty')!.textContent)
      .toContain('No data for this division yet.');
    expect(document.querySelector('.chart-svg')).toBeNull();
    g.destroy();
  });

  it('shows a division-scoped message when the selected division is empty', async () => {
    const { g } = setup();
    g.onSnapshot(race({
      league_division_names: ['Premier', 'Championship'],
      horses: [horse('a', 'Alpha', 1, 1)],   // nobody in division 2
    }));
    g.button.click();
    await vi.waitFor(() => expect(document.querySelector('.chart-svg')).toBeTruthy());
    document.querySelector<HTMLButtonElement>('.race-graphs-div[data-division="2"]')!.click();
    expect(document.querySelector('.race-graphs-empty')!.textContent)
      .toContain('No data for this division yet');
    g.destroy();
  });

  it('shows an error message and stays open when the fetch fails', async () => {
    const fetchSeries = vi.fn(async () => { throw new Error('boom'); });
    const { g } = setup({ fetchSeries });
    g.onSnapshot(race());
    g.button.click();
    await vi.waitFor(() => expect(document.querySelector('.race-graphs-empty')).toBeTruthy());
    expect(document.querySelector('.race-graphs-empty')!.textContent).toContain("Couldn't load");
    expect(document.querySelector('.race-graphs')).toBeTruthy();   // still open
    g.destroy();
  });

  it('recovers on the next snapshot after a failure', async () => {
    let fail = true;
    const fetchSeries = vi.fn(async () => {
      if (fail) throw new Error('boom');
      return series;
    });
    const { g } = setup({ fetchSeries });
    g.onSnapshot(race());
    g.button.click();
    await vi.waitFor(() => expect(document.querySelector('.race-graphs-empty')).toBeTruthy());
    fail = false;
    g.onSnapshot(race());
    await vi.waitFor(() => expect(document.querySelector('.chart-svg')).toBeTruthy());
    g.destroy();
  });

  it('resets to All when the selected division vanishes from a new snapshot', async () => {
    const { g } = setup();
    g.onSnapshot(race({
      league_division_names: ['Premier', 'Championship'],
      horses: [horse('a', 'Alpha', 1, 1), horse('b', 'Beta', 2, 2)],
    }));
    g.button.click();
    await vi.waitFor(() => expect(document.querySelector('.race-graphs-div')).toBeTruthy());
    document.querySelector<HTMLButtonElement>('.race-graphs-div[data-division="2"]')!.click();
    expect(document.querySelectorAll('.legend-item')).toHaveLength(1);

    g.onSnapshot(race({
      league_division_names: ['Premier'],
      horses: [horse('a', 'Alpha', 1, 1), horse('b', 'Beta', 2, 1)],
    }));
    await vi.waitFor(() => expect(document.querySelector('.chart-svg')).toBeTruthy());
    const allBtn = document.querySelector<HTMLButtonElement>('.race-graphs-div[data-division="all"]')!;
    expect(allBtn.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelectorAll('.legend-item')).toHaveLength(2);
    g.destroy();
  });
});

function liveRaceJson() {
  const now = Date.now();
  return {
    race_id: 'r1', name: 'Test Race', join_code: 'ABC123',
    start_time: new Date(now - 60_000).toISOString(),
    end_time: new Date(now + 3_600_000).toISOString(),
    tz: 'UTC', max_participants: 30, created_at: new Date(now - 120_000).toISOString(),
    status: 'live', server_time: new Date(now).toISOString(), time_left_seconds: 3600,
    horses: [],
  };
}

// renderRace has no fetchRace injection point and starts polling immediately,
// so — unlike the popup tests above, which inject fetchSeries — this suite
// stubs global fetch and fake timers, following site/test/race-stop-poll.test.ts.
describe('renderRace graph button wiring', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('mounts the button only when showGraphs is set', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(liveRaceJson()), {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    const { renderRace } = await import('../src/render/race.js');
    const root = document.createElement('div');
    document.body.appendChild(root);

    const off = renderRace(root, 'ABC123');
    expect(root.querySelector('.graphs-btn')).toBeNull();
    off();

    root.innerHTML = '';
    const on = renderRace(root, 'ABC123', { showGraphs: true });
    expect(root.querySelector('.graphs-btn')).toBeTruthy();
    on();
    expect(root.querySelector('.race-graphs')).toBeNull();
  });

  it('closes the popup when a finished snapshot arrives while it is open', async () => {
    let raceJson = liveRaceJson();
    // The popup fetches a different endpoint (…/series) than the race poll
    // (…/<code>); branch on the URL so both requests get a shape they can parse.
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const body = String(url).includes('/series')
        ? { start_ms: 0, end_ms: 3_600_000, horses: [] }
        : raceJson;
      return new Response(JSON.stringify(body), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }));
    const { renderRace } = await import('../src/render/race.js');
    const root = document.createElement('div');
    document.body.appendChild(root);

    const off = renderRace(root, 'ABC123', { showGraphs: true });
    await vi.advanceTimersByTimeAsync(0);   // first poll delivers the live snapshot
    root.querySelector<HTMLButtonElement>('.graphs-btn')!.click();
    await vi.waitFor(() => expect(root.querySelector('.race-graphs')).toBeTruthy());

    raceJson = { ...raceJson, status: 'finished', horses: [] };
    await vi.advanceTimersByTimeAsync(60_000);   // next poll tick delivers the finished snapshot
    await vi.waitFor(() => expect(root.querySelector('.podium')).toBeTruthy());
    expect(root.querySelector('.race-graphs')).toBeNull();
    off();
  });
});
