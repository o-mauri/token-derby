import { describe, it, expect } from 'vitest';
import { buildChartFaces } from '../src/render/race-chart.js';
import type { GetRaceSeriesResponse, HorseView } from '@token-derby/shared';

const COLORS = { body: '#4db8ff', mane: '#000', tail: '#000', saddle: '#f00' };
function horse(id: string, name: string, rank: number): HorseView {
  return {
    horse_id: id, stable_horse_id: `s-${id}`, name, colors: COLORS,
    current_tokens: 100, last_heartbeat: '', joined_at: '', rank,
  } as HorseView;
}

const series: GetRaceSeriesResponse = {
  start_ms: 0, end_ms: 600_000,
  horses: [
    { horse_id: 'a', points: [{ t: 60_000, d: 40 }, { t: 120_000, d: 60 }] },
    { horse_id: 'b', points: [{ t: 60_000, d: 10 }, { t: 120_000, d: 20 }] },
  ],
};
const horses = [horse('a', 'Alpha', 1), horse('b', 'Beta', 2)];

describe('buildChartFaces', () => {
  it('builds two faces, one line per horse, with a legend', () => {
    const faces = buildChartFaces(document, series, horses);
    expect(faces).toHaveLength(2);
    const [cumulative, throughput] = faces;
    // cumulative uses smoothed <path>; throughput uses raw <polyline>
    expect(cumulative!.querySelectorAll('svg path.chart-line').length).toBe(2);
    expect(throughput!.querySelectorAll('svg polyline.chart-line').length).toBe(2);
    expect(cumulative!.querySelectorAll('.chart-legend .legend-item').length).toBe(2);
  });

  it('returns no faces when no horse has data', () => {
    const empty: GetRaceSeriesResponse = {
      start_ms: 0, end_ms: 1, horses: [{ horse_id: 'a', points: [] }],
    };
    expect(buildChartFaces(document, empty, horses)).toEqual([]);
  });
});
