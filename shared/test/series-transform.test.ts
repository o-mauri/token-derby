import { describe, it, expect } from 'vitest';
import { toCumulative, toThroughput, bucketSeries } from '../src/series-transform.js';

describe('toCumulative', () => {
  it('returns running totals', () => {
    expect(toCumulative([{ t: 1, d: 10 }, { t: 2, d: 5 }, { t: 3, d: 20 }]))
      .toEqual([{ t: 1, total: 10 }, { t: 2, total: 15 }, { t: 3, total: 35 }]);
  });
  it('handles empty input', () => {
    expect(toCumulative([])).toEqual([]);
  });
});

describe('toThroughput', () => {
  it('computes tokens per minute from the gap to the previous point', () => {
    // first point: 120 tokens over 60s since start => 120/min
    // second point: 300 tokens over 120s => 150/min
    const out = toThroughput([{ t: 60_000, d: 120 }, { t: 180_000, d: 300 }], 0);
    expect(out[0]).toEqual({ t: 60_000, perMin: 120 });
    expect(out[1]).toEqual({ t: 180_000, perMin: 150 });
  });
  it('handles empty input', () => {
    expect(toThroughput([], 0)).toEqual([]);
  });
});

describe('bucketSeries', () => {
  it('passes through when at or under the cap', () => {
    const pts = [{ t: 1, d: 1 }, { t: 2, d: 2 }];
    expect(bucketSeries(pts, 0, 10, 5)).toEqual(pts);
  });
  it('downsamples to at most maxBuckets while preserving total tokens', () => {
    const pts = Array.from({ length: 100 }, (_, i) => ({ t: i * 100, d: 1 }));
    const out = bucketSeries(pts, 0, 100 * 100, 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.reduce((s, p) => s + p.d, 0)).toBe(100);
  });
});
