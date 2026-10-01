import { describe, it, expect } from 'vitest';
import {
  fitHabits, fitOrgFallback, loginPropensity, presenceByBin, encodeDensity, decodeDensity, median,
} from '../../src/attendance/habits.js';
import { fitDensity, type Span } from '../../src/attendance/kde.js';
import { GRID, TRI_CELLS, binOf } from '../../src/attendance/clock.js';

const office: Span[] = [
  { arrival: 540, departure: 1020 }, { arrival: 555, departure: 1005 }, { arrival: 570, departure: 1035 },
  { arrival: 530, departure: 990 }, { arrival: 600, departure: 1050 },
];

describe('loginPropensity', () => {
  it('is the Beta(1,1) posterior mean', () => {
    expect(loginPropensity(5, 8)).toBeCloseTo(0.6, 10);
    expect(loginPropensity(0, 0)).toBe(0.5);
  });
});

describe('fitHabits', () => {
  it('returns null with no spans', () => {
    expect(fitHabits({ spans: [], orgRaceCount: 4 })).toBeNull();
  });
  it('fits propensity, density and display fields', () => {
    const h = fitHabits({ spans: office, orgRaceCount: 8 })!;
    expect(h.login_propensity).toBeCloseTo(0.6, 10);
    expect(h.span_count).toBe(5);
    expect(h.avg_daily_race_hours).toBeCloseTo((480 + 450 + 465 + 460 + 450) / 5 / 60, 6);
    expect(h.hourly_probability_array).toHaveLength(24);
    for (const p of h.hourly_probability_array) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(h.login_propensity + 1e-9);
    }
    // Present through the middle of the day, absent at 03:00.
    expect(h.hourly_probability_array[12]!).toBeGreaterThan(0.5);
    expect(h.hourly_probability_array[3]!).toBeLessThan(0.01);
    expect(h.peak_activity_window.start >= '09:00').toBe(true);
    expect(h.peak_activity_window.end <= '17:30').toBe(true);
  });
});

describe('fitOrgFallback', () => {
  it('returns null without any known players', () => {
    expect(fitOrgFallback({ allSpans: office, propensities: [] })).toBeNull();
  });
  it('uses the median propensity across players', () => {
    const h = fitOrgFallback({ allSpans: office, propensities: [0.2, 0.9, 0.5] })!;
    expect(h.login_propensity).toBe(0.5);
    expect(h.span_count).toBe(5);
  });
});

describe('presenceByBin', () => {
  it('is near 1 inside every span and near 0 outside all of them', () => {
    const p = presenceByBin(fitDensity(office)!);
    expect(p).toHaveLength(GRID);
    expect(p[binOf(780)]!).toBeGreaterThan(0.95);
    expect(p[binOf(180)]!).toBeLessThan(0.01);
  });
});

describe('density encoding', () => {
  it('stores the upper triangle as 16-bit values', () => {
    const encoded = encodeDensity(fitDensity(office)!);
    expect(encoded.length).toBe(Math.ceil((TRI_CELLS * 2) / 3) * 4);
  });
  it('round-trips within quantisation error', () => {
    const d = fitDensity(office)!;
    const back = decodeDensity(encodeDensity(d));
    const max = d.reduce((m, v) => Math.max(m, v), 0);
    for (let i = 0; i < d.length; i++) expect(Math.abs(back[i]! - d[i]!)).toBeLessThanOrEqual(1e-4 * max);
  });
  it('rejects a payload of the wrong size', () => {
    expect(() => decodeDensity(btoa('abc'))).toThrow();
  });
});

describe('median', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});
