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
});
