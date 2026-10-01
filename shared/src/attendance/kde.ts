// 2D Gaussian KDE over (arrival, departure) clock minutes, matching
// scipy.stats.gaussian_kde (Scott's rule), evaluated onto the habit grid.
import { GRID, BIN_MINUTES, binCentre, cellIndex } from './clock.js';

export type Span = { arrival: number; departure: number };

export const FALLBACK_BANDWIDTH_MIN = 30;
const TRUNCATE_SIGMAS = 4;

/** Kernel covariance [[a, b], [b, c]] in minutes². Isotropic 30 min when the sample can't support one. */
export function bandwidth(spans: Span[]): { a: number; b: number; c: number } {
  const iso = { a: FALLBACK_BANDWIDTH_MIN ** 2, b: 0, c: FALLBACK_BANDWIDTH_MIN ** 2 };
  const n = spans.length;
  if (n < 2) return iso;
  let mx = 0, my = 0;
  for (const s of spans) { mx += s.arrival; my += s.departure; }
  mx /= n; my /= n;
  let sxx = 0, sxy = 0, syy = 0;
  for (const s of spans) {
    const dx = s.arrival - mx, dy = s.departure - my;
    sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
  }
  const scott = Math.pow(n, -1 / 3);
  const a = (sxx / (n - 1)) * scott, b = (sxy / (n - 1)) * scott, c = (syy / (n - 1)) * scott;
  const det = a * c - b * b;
  if (!(a > 0) || !(c > 0) || !(det > 1e-9 * a * c)) return iso;
  return { a, b, c };
}

const clampBin = (b: number) => Math.min(GRID - 1, Math.max(0, b));

/** Upper-triangle density summing to 1, or null when nothing lands on the grid. */
export function fitDensity(spans: Span[]): Float32Array | null {
  if (spans.length === 0) return null;
  const { a, b, c } = bandwidth(spans);
  const det = a * c - b * b;
  const ia = c / det, ib = -b / det, ic = a / det;
  const rx = TRUNCATE_SIGMAS * Math.sqrt(a), ry = TRUNCATE_SIGMAS * Math.sqrt(c);

  const grid = new Float64Array(GRID * GRID);
  for (const s of spans) {
    const x0 = clampBin(Math.floor((s.arrival - rx) / BIN_MINUTES));
    const x1 = clampBin(Math.ceil((s.arrival + rx) / BIN_MINUTES));
    const y0 = clampBin(Math.floor((s.departure - ry) / BIN_MINUTES));
    const y1 = clampBin(Math.ceil((s.departure + ry) / BIN_MINUTES));
    for (let x = x0; x <= x1; x++) {
      const dx = binCentre(x) - s.arrival;
      for (let y = Math.max(x, y0); y <= y1; y++) {
        const dy = binCentre(y) - s.departure;
        const i = cellIndex(x, y);
        grid[i] = grid[i]! + Math.exp(-0.5 * (ia * dx * dx + 2 * ib * dx * dy + ic * dy * dy));
      }
    }
  }

  let total = 0;
  for (let i = 0; i < grid.length; i++) total += grid[i]!;
  if (!(total > 0) || !Number.isFinite(total)) return null;
  const out = new Float32Array(GRID * GRID);
  for (let i = 0; i < grid.length; i++) out[i] = grid[i]! / total;
  return out;
}
