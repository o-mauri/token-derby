import { describe, it, expect } from 'vitest';
import { resampleToTicks, trailingPace, trailingMovingAverage, PACE_WINDOW_MS } from '../src/series-transform.js';

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

describe('trailingPace', () => {
  const now = 100 * MIN;

  it('sums deltas within the window and divides by its minutes', () => {
    // 15-min window ending at `now`: 3000 tokens over the window => 200/min.
    const pts = [{ t: now - 10 * MIN, d: 1500 }, { t: now - 2 * MIN, d: 1500 }];
    expect(trailingPace(pts, now, PACE_WINDOW_MS)).toBe(200);
  });

  it('ignores points older than the window', () => {
    const pts = [
      { t: now - 20 * MIN, d: 9000 }, // outside the 15-min window → ignored
      { t: now - 5 * MIN, d: 1500 },
    ];
    expect(trailingPace(pts, now, PACE_WINDOW_MS)).toBe(100); // 1500 / 15
  });

  it('includes a point exactly on the window boundary', () => {
    const pts = [{ t: now - PACE_WINDOW_MS, d: 1500 }];
    expect(trailingPace(pts, now, PACE_WINDOW_MS)).toBe(100);
  });

  it('returns 0 when there are no points in the window', () => {
    expect(trailingPace([], now, PACE_WINDOW_MS)).toBe(0);
    expect(trailingPace([{ t: now - 30 * MIN, d: 500 }], now, PACE_WINDOW_MS)).toBe(0);
  });

  it('divides by the clamped window early in a race (not the full 15 min)', () => {
    // Race only 3 minutes old: caller passes a 3-min window, so 600 tokens => 200/min.
    expect(trailingPace([{ t: now - 1 * MIN, d: 600 }], now, 3 * MIN)).toBe(200);
  });

  it('returns null when the window is under a minute (too little race to measure)', () => {
    expect(trailingPace([{ t: now, d: 50 }], now, 30_000)).toBeNull();
  });
});

describe('trailingMovingAverage', () => {
  it('ramps the window up from 1 sample, then holds at maxWindow', () => {
    // window grows 1,2,3 (=maxWindow) then stays 3:
    //  i0: mean(10)                = 10
    //  i1: mean(10,20)             = 15
    //  i2: mean(10,20,30)          = 20
    //  i3: mean(20,30,40)          = 30   (drops the oldest, 10)
    //  i4: mean(30,40,50)          = 40
    expect(trailingMovingAverage([10, 20, 30, 40, 50], 3)).toEqual([10, 15, 20, 30, 40]);
  });

  it('with maxWindow 1 returns the input unchanged (each point is its own mean)', () => {
    expect(trailingMovingAverage([5, 9, 2], 1)).toEqual([5, 9, 2]);
  });

  it('smooths a spike toward its neighbours instead of dropping it as a gap', () => {
    // A lone spike at index 1 is spread across the ramp-up window, never a gap.
    expect(trailingMovingAverage([0, 90, 0, 0], 3)).toEqual([0, 45, 30, 30]);
  });

  it('returns an empty array for empty input', () => {
    expect(trailingMovingAverage([], 10)).toEqual([]);
  });

  it('throws when maxWindow is under 1', () => {
    expect(() => trailingMovingAverage([1, 2], 0)).toThrow();
  });
});
