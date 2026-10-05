import type { GetRaceSeriesResponse, HorseView } from '@token-derby/shared';
import { LINE_PALETTE, chartGeometry, chartLines, colourMap, fitWidth, lineColor, windowEnd } from './chart';

const horse = (id: string, name: string, rank: number, division?: number): HorseView =>
  ({ horse_id: id, stable_horse_id: `s-${id}`, name, colors: { body: '#4db8ff', mane: '#000', tail: '#000', saddle: '#f00' },
    current_tokens: 100, last_heartbeat: '', joined_at: '', rank, division } as HorseView);

const series: GetRaceSeriesResponse = {
  start_ms: 0, end_ms: 600_000,
  horses: [
    { horse_id: 'a', points: [{ t: 60_000, d: 40 }, { t: 120_000, d: 60 }] },
    { horse_id: 'b', points: [{ t: 60_000, d: 10 }, { t: 120_000, d: 20 }] },
  ],
};
const horses = [horse('a', 'Alpha', 1), horse('b', 'Beta', 2)];

describe('chartLines', () => {
  it('gives every horse a line, in rank order whatever the input order', () => {
    const c = chartLines('cumulative', series, [horses[1]!, horses[0]!], series.end_ms);
    expect(c.lines.map((l) => l.name)).toEqual(['Alpha', 'Beta']);
    expect(c.hasData).toBe(true);
  });

  it('colours lines from the palette by rank, ignoring the horse\'s own colours', () => {
    const c = chartLines('cumulative', series, horses, series.end_ms);
    expect(c.lines.map((l) => l.colour)).toEqual([lineColor(0), lineColor(1)]);
    expect(lineColor(LINE_PALETTE.length)).toBe(LINE_PALETTE[0]);
  });

  it('uses colourOf when given, for colours that stay put through overtakes', () => {
    const c = chartLines('cumulative', series, horses, series.end_ms, (h) => (h.horse_id === 'a' ? '#111111' : '#222222'));
    expect(c.lines.map((l) => l.colour)).toEqual(['#111111', '#222222']);
  });

  it('accumulates scored tokens for the cumulative chart', () => {
    const c = chartLines('cumulative', series, horses, series.end_ms);
    expect(c.lines[0]!.vals.at(-1)!.v).toBe(100);
    expect(c.maxV).toBe(100);
  });

  it('reports no data when no horse has points, and keeps a flat line for a horse that has none', () => {
    const none: GetRaceSeriesResponse = { start_ms: 0, end_ms: 1, horses: [{ horse_id: 'a', points: [] }] };
    expect(chartLines('cumulative', none, horses, 1).hasData).toBe(false);
    const mixed: GetRaceSeriesResponse = { ...series, horses: [series.horses[0]!, { horse_id: 'b', points: [] }] };
    const c = chartLines('throughput', mixed, horses, series.end_ms);
    expect(c.lines.length).toBe(2);
    expect(c.lines[1]!.vals.every((p) => p.v === 0)).toBe(true);
  });

  it('stops at endMs instead of running flat to the scheduled end', () => {
    const c = chartLines('cumulative', series, horses, 180_000);
    expect(Math.max(...c.lines[0]!.vals.map((p) => p.t))).toBeLessThanOrEqual(180_000);
  });
});

describe('chartGeometry', () => {
  it('draws cumulative lines as smooth paths and pace as polylines inside the padded box', () => {
    const cum = chartGeometry(chartLines('cumulative', series, horses, series.end_ms), 'cumulative', 600);
    expect(cum.lines[0]!.d.startsWith('M40.0,')).toBe(true);
    expect(cum.lines[0]!.d).toContain(' C');
    const pace = chartGeometry(chartLines('throughput', series, horses, series.end_ms), 'throughput', 600);
    expect(pace.lines[0]!.points).toMatch(/^40\.0,/);
  });

  it('labels the axes with the start and end clock times and the peak value', () => {
    const g = chartGeometry(chartLines('throughput', series, horses, series.end_ms), 'throughput', 600);
    expect(g.peakLabel).toMatch(/\/m$/);
    expect(g.width).toBe(600);
    expect(g.grid.length).toBe(3);
  });
});

describe('fitWidth', () => {
  it('matches a wide box\'s aspect so lines span the full width', () => expect(fitWidth(1200, 300)).toBe(1200));
  it('never squeezes narrower than square', () => expect(fitWidth(200, 600)).toBe(300));
});

describe('colourMap and windowEnd', () => {
  it('maps colours by sorted horse id, so they stay put when positions change', () => {
    const m = colourMap([horse('z', 'Z', 1), horse('a', 'A', 2)]);
    expect(m.get('a')).toBe(LINE_PALETTE[0]);
    expect(m.get('z')).toBe(LINE_PALETTE[1]);
  });

  it('ends a live chart at now, but never before the newest point or after the scheduled end', () => {
    expect(windowEnd(series, 90_000)).toBe(120_000);
    expect(windowEnd(series, 300_000)).toBe(300_000);
    expect(windowEnd(series, 9_999_999)).toBe(600_000);
  });
});
