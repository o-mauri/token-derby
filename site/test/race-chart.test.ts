import { describe, it, expect } from 'vitest';
import { buildChartFaces, lineColor } from '../src/render/race-chart.js';
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

    // Lines are coloured by the distinct palette in rank order, not by horse colour.
    const lines = cumulative!.querySelectorAll('svg path.chart-line');
    expect(lines[0]!.getAttribute('stroke')).toBe(lineColor(0));
    expect(lines[1]!.getAttribute('stroke')).toBe(lineColor(1));
    expect(lines[2]!.getAttribute('stroke')).toBe(lineColor(2));
  });

  it('assigns distinct palette colours by rank, independent of horse colour', () => {
    // Both horses share the SAME body colour — their lines must still differ.
    const same = makeColors('#123456');
    const coloredHorses = [horse('a', 'Alpha', 1, same), horse('b', 'Beta', 2, same)];
    const faces = buildChartFaces(document, series, coloredHorses);
    const [cumulative, throughput] = faces;

    const paths = cumulative!.querySelectorAll('svg path.chart-line');
    expect(paths[0]!.getAttribute('stroke')).toBe(lineColor(0));
    expect(paths[1]!.getAttribute('stroke')).toBe(lineColor(1));
    expect(paths[0]!.getAttribute('stroke')).not.toBe(paths[1]!.getAttribute('stroke'));
    // Not driven by the (identical) horse colour:
    expect(paths[0]!.getAttribute('stroke')).not.toBe(same.body);

    const polylines = throughput!.querySelectorAll('svg polyline.chart-line');
    expect(polylines[0]!.getAttribute('stroke')).toBe(lineColor(0));
    expect(polylines[1]!.getAttribute('stroke')).toBe(lineColor(1));

    // Legend chips follow the same palette, by rank.
    const chips = cumulative!.querySelectorAll('.chart-legend .legend-chip');
    expect((chips[0] as HTMLElement).style.background).toBe(lineColor(0));
    expect((chips[1] as HTMLElement).style.background).toBe(lineColor(1));
  });
});

describe('buildChartFaces options', () => {
  it('builds only the requested face', () => {
    const doc = document;
    const horses = [horse('a', 'Alpha', 1), horse('b', 'Beta', 2)];
    const faces = buildChartFaces(doc, series, horses, { modes: ['throughput'] });
    expect(faces).toHaveLength(1);
    expect(faces[0]!.querySelector('.chart-title')!.textContent).toContain('Tokens produced / min');
  });

  it('clamps the x-axis to endMs instead of series.end_ms', () => {
    const doc = document;
    const horses = [horse('a', 'Alpha', 1)];
    const full = buildChartFaces(doc, series, horses, { modes: ['cumulative'] })[0]!;
    const clamped = buildChartFaces(doc, series, horses, { modes: ['cumulative'], endMs: 180_000 })[0]!;
    // The last x-axis tick label is the window end, so clamping must change it.
    const labels = (el: HTMLElement) =>
      [...el.querySelectorAll('.chart-axis')].map((n) => n.textContent).join('|');
    expect(labels(clamped)).not.toBe(labels(full));
  });

  it('clamps the actual chart geometry, not just the axis label', () => {
    // A label-only assertion would still pass if endMs were dropped from the
    // resample/scale path while left in the axis label — assert the point
    // count of the drawn line instead: a 3-minute window draws an anchor plus
    // one point per minute (4), a 10-minute window draws 11.
    const doc = document;
    const horses = [horse('a', 'Alpha', 1)];
    const pointCount = (endMs: number) => {
      const face = buildChartFaces(doc, series, horses, { modes: ['throughput'], endMs })[0]!;
      const polyline = face.querySelector('svg polyline.chart-line')!;
      return polyline.getAttribute('points')!.trim().split(/\s+/).length;
    };
    expect(pointCount(180_000)).toBe(4);    // 3-minute clamped window: anchor + 3
    expect(pointCount(series.end_ms)).toBe(11); // full 10-minute window: anchor + 10
  });

  it('uses colourOf when supplied', () => {
    const doc = document;
    const horses = [horse('a', 'Alpha', 1), horse('b', 'Beta', 2)];
    const faces = buildChartFaces(doc, series, horses, {
      modes: ['cumulative'],
      colourOf: (h) => (h.horse_id === 'a' ? '#123456' : '#654321'),
    });
    const strokes = [...faces[0]!.querySelectorAll('path.chart-line')].map((p) => p.getAttribute('stroke'));
    // Per-index, not just "both appear somewhere" — a toContain-only check would
    // still pass if the horse→colour mapping were swapped.
    expect(strokes[0]).toBe('#123456');   // Alpha, rank 1
    expect(strokes[1]).toBe('#654321');   // Beta, rank 2
  });

  it('with no options reproduces the existing two faces and rank colours', () => {
    const doc = document;
    const horses = [horse('a', 'Alpha', 1), horse('b', 'Beta', 2)];
    const faces = buildChartFaces(doc, series, horses);
    expect(faces).toHaveLength(2);
    const strokes = [...faces[0]!.querySelectorAll('path.chart-line')].map((p) => p.getAttribute('stroke'));
    expect(strokes[0]).toBe(lineColor(0));
  });
});
