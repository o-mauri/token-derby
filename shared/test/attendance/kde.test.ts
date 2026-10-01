import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fitDensity, bandwidth, FALLBACK_BANDWIDTH_MIN, type Span } from '../../src/attendance/kde.js';
import { GRID, cellIndex } from '../../src/attendance/clock.js';

type Fixture = { name: string; spans: [number, number][]; max: number; probes: [number, number, number][] };
const fixtures: Fixture[] = JSON.parse(
  readFileSync(new URL('../fixtures/kde.json', import.meta.url), 'utf8'),
).cases;

const total = (d: Float32Array) => d.reduce((s, v) => s + v, 0);
const lowerMass = (d: Float32Array) => {
  let m = 0;
  for (let x = 0; x < GRID; x++) for (let y = 0; y < x; y++) m += d[cellIndex(x, y)]!;
  return m;
};

describe('fitDensity against scipy', () => {
  for (const f of fixtures) {
    it(`matches gaussian_kde for "${f.name}"`, () => {
      const spans: Span[] = f.spans.map(([arrival, departure]) => ({ arrival, departure }));
      const d = fitDensity(spans)!;
      for (const [x, y, v] of f.probes) {
        expect(Math.abs(d[cellIndex(x, y)]! - v)).toBeLessThanOrEqual(1e-3 * f.max);
      }
    });
  }
});

describe('fitDensity', () => {
  it('returns null with no spans', () => {
    expect(fitDensity([])).toBeNull();
  });
  it('normalises the upper triangle to 1 and leaves the lower triangle empty', () => {
    const d = fitDensity([{ arrival: 540, departure: 1020 }, { arrival: 560, departure: 990 }, { arrival: 600, departure: 1050 }])!;
    expect(total(d)).toBeCloseTo(1, 5);
    expect(lowerMass(d)).toBe(0);
  });
  it('accepts a single span, including one on the diagonal', () => {
    const d = fitDensity([{ arrival: 600, departure: 600 }])!;
    expect(total(d)).toBeCloseTo(1, 5);
    expect(d[cellIndex(100, 100)]!).toBeGreaterThan(0);
  });
  it('stays inside the grid for spans at both edges', () => {
    const d = fitDensity([{ arrival: 0, departure: 0 }, { arrival: 1439.9, departure: 1439.9 }, { arrival: 2, departure: 1439 }])!;
    expect(d.length).toBe(GRID * GRID);
    expect(total(d)).toBeCloseTo(1, 5);
    expect(d.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
  });
});

describe('bandwidth', () => {
  it('falls back to 30 minutes for one span', () => {
    expect(bandwidth([{ arrival: 600, departure: 900 }])).toEqual({ a: FALLBACK_BANDWIDTH_MIN ** 2, b: 0, c: FALLBACK_BANDWIDTH_MIN ** 2 });
  });
  it('falls back when every span sits on a line', () => {
    const line = [0, 10, 20, 30].map((i) => ({ arrival: 500 + i, departure: 900 + i }));
    expect(bandwidth(line).b).toBe(0);
  });
  it('scales the sample covariance by n^(-1/3)', () => {
    const spans = [{ arrival: 0, departure: 10 }, { arrival: 10, departure: 0 }, { arrival: 0, departure: 0 }, { arrival: 10, departure: 10 }]
      .map((s) => ({ arrival: s.arrival + 500, departure: s.departure + 900 }));
    const h = bandwidth(spans);
    // Sample variance of [0,10,0,10] is 100/3; n = 4.
    expect(h.a).toBeCloseTo((100 / 3) * Math.pow(4, -1 / 3), 6);
    expect(h.b).toBeCloseTo(0, 6);
  });
});
