import { describe, it, expect } from 'vitest';
import {
  shape, blendedPace, joinedFractionByNow, phantomCount, recentPacePrior,
  PACE_PRIOR_CROSSOVER_MIN, PHANTOM_SCALE, MARGIN, SIMULATIONS, MARKET_OPEN_MIN,
  RECENT_PACES_WINDOW, FIELD_MEDIAN_PACE,
} from '../src/markets.js';

describe('shape', () => {
  it('reproduces the fitted curve', () => {
    expect(shape(60)).toBeCloseTo(0.62, 2);
    expect(shape(240)).toBeCloseTo(1.67, 2);
    expect(shape(720)).toBeCloseTo(3.70, 2);
  });
  it('increases with time remaining — a longer run-in averages noise out', () => {
    for (let h = 30; h < 720; h += 30) expect(shape(h + 30)).toBeGreaterThan(shape(h));
  });
  it('never drops below the floor, even at the line', () => {
    expect(shape(1)).toBeGreaterThanOrEqual(0.2);
    expect(shape(0)).toBeGreaterThanOrEqual(0.2);
  });
});

describe('blendedPace', () => {
  it('is pure history at the off', () => {
    expect(blendedPace({ observed: 9999, prior: 100, elapsedMin: 0 })).toBeCloseTo(100, 6);
  });
  it('is an even blend at the crossover', () => {
    const p = blendedPace({ observed: 200, prior: 100, elapsedMin: PACE_PRIOR_CROSSOVER_MIN });
    expect(p).toBeCloseTo(150, 6);
  });
  it('leans on the race as it wears on', () => {
    const late = blendedPace({ observed: 200, prior: 100, elapsedMin: 480 });
    expect(late).toBeGreaterThan(150);
    expect(late).toBeLessThan(200);
  });
  it('never goes negative', () => {
    expect(blendedPace({ observed: -50, prior: 0, elapsedMin: 60 })).toBe(0);
  });
});

describe('joinedFractionByNow', () => {
  it('says nobody has joined at the off', () => {
    expect(joinedFractionByNow(0, 9)).toBe(0);
  });
  it('fills small fields much faster than large ones', () => {
    // Measured: at 10% elapsed a 3-6 field is 83% present, an 11+ field is 27%.
    expect(joinedFractionByNow(0.10, 5)).toBeCloseTo(0.83, 2);
    expect(joinedFractionByNow(0.10, 9)).toBeCloseTo(0.75, 2);
    expect(joinedFractionByNow(0.10, 15)).toBeCloseTo(0.27, 2);
  });
  it('reaches a full field by the time the curve tops out', () => {
    expect(joinedFractionByNow(0.60, 15)).toBe(1);
    expect(joinedFractionByNow(1.0, 15)).toBe(1);
  });
  it('never decreases', () => {
    for (const n of [5, 9, 15]) {
      for (let f = 0; f < 1; f += 0.05) {
        expect(joinedFractionByNow(f + 0.05, n)).toBeGreaterThanOrEqual(joinedFractionByNow(f, n));
      }
    }
  });
});

describe('phantomCount', () => {
  it('expects a whole field before anyone has arrived', () => {
    expect(phantomCount({ elapsedFraction: 0, expectedField: 12 }))
      .toBe(Math.round(12 * PHANTOM_SCALE));
  });
  it('drains to zero once the field is complete', () => {
    expect(phantomCount({ elapsedFraction: 0.60, expectedField: 12 })).toBe(0);
    expect(phantomCount({ elapsedFraction: 0.95, expectedField: 12 })).toBe(0);
  });
  it('never goes negative', () => {
    expect(phantomCount({ elapsedFraction: 2, expectedField: 12 })).toBe(0);
  });
  it('is monotonically non-increasing through the race', () => {
    let prev = Infinity;
    for (let f = 0; f <= 1; f += 0.05) {
      const n = phantomCount({ elapsedFraction: f, expectedField: 15 });
      expect(n).toBeLessThanOrEqual(prev);
      prev = n;
    }
  });
});

describe('constants match the spec', () => {
  it('pins the tuned values', () => {
    expect(PACE_PRIOR_CROSSOVER_MIN).toBe(120);
    expect(PHANTOM_SCALE).toBe(0.70);
    expect(MARGIN).toBe(0.01);
    expect(SIMULATIONS).toBe(10_000);
    expect(MARKET_OPEN_MIN).toBe(20);
    expect(RECENT_PACES_WINDOW).toBe(10);
    expect(FIELD_MEDIAN_PACE).toBe(1214);
  });
});

describe('recentPacePrior', () => {
  it('falls back to the field median for a debutant with no history', () => {
    expect(recentPacePrior(undefined, FIELD_MEDIAN_PACE)).toBe(FIELD_MEDIAN_PACE);
    expect(recentPacePrior([], FIELD_MEDIAN_PACE)).toBe(FIELD_MEDIAN_PACE);
  });
  it('averages the recorded paces', () => {
    expect(recentPacePrior([100, 200, 300], 1214)).toBeCloseTo(200, 6);
  });
  it('only considers the trailing window, oldest paces drop off', () => {
    const paces = Array.from({ length: RECENT_PACES_WINDOW + 5 }, (_, i) => i * 10);
    const windowed = paces.slice(-RECENT_PACES_WINDOW);
    const expected = windowed.reduce((a, b) => a + b, 0) / windowed.length;
    expect(recentPacePrior(paces, 1214)).toBeCloseTo(expected, 6);
    // Confirms the early, larger-count values were excluded from the mean.
    expect(recentPacePrior(paces, 1214)).not.toBeCloseTo(
      paces.reduce((a, b) => a + b, 0) / paces.length, 6,
    );
  });
});
