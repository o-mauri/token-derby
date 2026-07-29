import { describe, it, expect, vi } from 'vitest';
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
});
