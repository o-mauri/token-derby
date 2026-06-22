import { describe, it, expect } from 'vitest';
import { resampleToTicks } from '../src/series-transform.js';

const MIN = 60_000;

describe('resampleToTicks', () => {
  it('starts from a zero anchor at the window start', () => {
    const out = resampleToTicks([], 0, 2 * MIN);
    expect(out[0]).toEqual({ t: 0, total: 0, perMin: 0 });
  });

  it('emits an anchor plus one point per tick', () => {
    // 5-minute window, 1-minute ticks => 5 ticks + 1 anchor
    const out = resampleToTicks([], 0, 5 * MIN);
    expect(out).toHaveLength(6);
  });

  it('accumulates deltas within a tick and reports tokens/min for that minute', () => {
    // One burst of 120 tokens in the first minute, then idle.
    const out = resampleToTicks([{ t: 30_000, d: 120 }], 0, 3 * MIN);
    expect(out[1]).toEqual({ t: 1 * MIN, total: 120, perMin: 120 });
    // idle ticks carry the cumulative total forward and show 0 pace
    expect(out[2]).toEqual({ t: 2 * MIN, total: 120, perMin: 0 });
    expect(out[3]).toEqual({ t: 3 * MIN, total: 120, perMin: 0 });
  });

  it('sums multiple points that fall in the same tick', () => {
    const out = resampleToTicks([{ t: 10_000, d: 30 }, { t: 50_000, d: 70 }], 0, 1 * MIN);
    expect(out[1]).toEqual({ t: 1 * MIN, total: 100, perMin: 100 });
  });

  it('keeps the cumulative total monotonic across active and idle ticks', () => {
    const out = resampleToTicks(
      [{ t: 30_000, d: 50 }, { t: 150_000, d: 25 }], // minute 1 and minute 3
      0, 4 * MIN,
    );
    expect(out.map((p) => p.total)).toEqual([0, 50, 50, 75, 75]);
    expect(out.map((p) => p.perMin)).toEqual([0, 50, 0, 25, 0]);
  });

  it('normalises pace to per-minute when ticks are wider than a minute', () => {
    // 2-minute ticks: 200 tokens in the first tick => 100 tokens/min.
    const out = resampleToTicks([{ t: 30_000, d: 200 }], 0, 2 * MIN, 2 * MIN);
    expect(out[1]).toEqual({ t: 2 * MIN, total: 200, perMin: 100 });
  });
});
