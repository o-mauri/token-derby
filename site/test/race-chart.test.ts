import { describe, it, expect } from 'vitest';
import { buildChartFaces } from '../src/render/race-chart.js';
import type { GetRaceSeriesResponse, HorseView } from '@token-derby/shared';

function makeColors(body: string) {
  return { body, mane: '#000', tail: '#000', saddle: '#f00' };
}
const COLORS = makeColors('#4db8ff');

function horse(id: string, name: string, rank: number, colors = COLORS): HorseView {
  return {
    horse_id: id, stable_horse_id: `s-${id}`, name, colors,
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

  it('draws a flat baseline for no-data horses and keeps them in the legend (mixed case)', () => {
    const mixedSeries: GetRaceSeriesResponse = {
      start_ms: 0, end_ms: 600_000,
      horses: [
        { horse_id: 'a', points: [{ t: 60_000, d: 40 }] },
        { horse_id: 'b', points: [] }, // no data
      ],
    };
    const mixedHorses = [horse('a', 'Alpha', 1), horse('b', 'Beta', 2)];
    const faces = buildChartFaces(document, mixedSeries, mixedHorses);
    expect(faces).toHaveLength(2);
    const [cumulative, throughput] = faces;
    // Both horses get a line — no-data horse gets a flat baseline
    expect(cumulative!.querySelectorAll('svg path.chart-line').length).toBe(2);
    expect(throughput!.querySelectorAll('svg polyline.chart-line').length).toBe(2);
    // Both horses remain in the legend
    expect(cumulative!.querySelectorAll('.chart-legend .legend-item').length).toBe(2);
    expect(throughput!.querySelectorAll('.chart-legend .legend-item').length).toBe(2);
  });

  it('renders lines and legend items in ascending rank order regardless of input order', () => {
    const colorA = makeColors('#ff0000');
    const colorB = makeColors('#00ff00');
    const colorC = makeColors('#0000ff');
    // Input order: rank 3, rank 1, rank 2 — reversed from sort order
    const unorderedHorses = [
      horse('c', 'Charlie', 3, colorC),
      horse('a', 'Alpha', 1, colorA),
      horse('b', 'Beta', 2, colorB),
    ];
    const unorderedSeries: GetRaceSeriesResponse = {
      start_ms: 0, end_ms: 600_000,
      horses: [
        { horse_id: 'a', points: [{ t: 60_000, d: 10 }] },
        { horse_id: 'b', points: [{ t: 60_000, d: 20 }] },
        { horse_id: 'c', points: [{ t: 60_000, d: 30 }] },
      ],
    };
    const faces = buildChartFaces(document, unorderedSeries, unorderedHorses);
    const [cumulative] = faces;

    // Legend items should appear in rank order: Alpha (1), Beta (2), Charlie (3)
    const legendItems = cumulative!.querySelectorAll('.chart-legend .legend-item');
    expect(legendItems[0]!.textContent).toBe('Alpha');
    expect(legendItems[1]!.textContent).toBe('Beta');
    expect(legendItems[2]!.textContent).toBe('Charlie');

    // Lines should appear in rank order: strokes match colorA, colorB, colorC
    const lines = cumulative!.querySelectorAll('svg path.chart-line');
    expect(lines[0]!.getAttribute('stroke')).toBe(colorA.body);
    expect(lines[1]!.getAttribute('stroke')).toBe(colorB.body);
    expect(lines[2]!.getAttribute('stroke')).toBe(colorC.body);
  });

  it('propagates each horse color.body to stroke and legend chip background', () => {
    const colorA = makeColors('#aabbcc');
    const colorB = makeColors('#112233');
    const coloredHorses = [horse('a', 'Alpha', 1, colorA), horse('b', 'Beta', 2, colorB)];
    const faces = buildChartFaces(document, series, coloredHorses);
    const [cumulative, throughput] = faces;

    // Cumulative paths
    const paths = cumulative!.querySelectorAll('svg path.chart-line');
    expect(paths[0]!.getAttribute('stroke')).toBe(colorA.body);
    expect(paths[1]!.getAttribute('stroke')).toBe(colorB.body);

    // Throughput polylines
    const polylines = throughput!.querySelectorAll('svg polyline.chart-line');
    expect(polylines[0]!.getAttribute('stroke')).toBe(colorA.body);
    expect(polylines[1]!.getAttribute('stroke')).toBe(colorB.body);

    // Legend chips
    const chips = cumulative!.querySelectorAll('.chart-legend .legend-chip');
    expect((chips[0] as HTMLElement).style.background).toBe(colorA.body);
    expect((chips[1] as HTMLElement).style.background).toBe(colorB.body);
  });
});
