// Turns a player's spans into a fitted habit: turn-up rate, density and display figures.
import { GRID, TRI_CELLS, BIN_MINUTES, cellIndex, formatClock } from './clock.js';
import { fitDensity, type Span } from './kde.js';

export type Habit = {
  login_propensity: number;
  density: Float32Array;
  span_count: number;
  avg_daily_race_hours: number;
  peak_activity_window: { start: string; end: string };
  hourly_probability_array: number[];
};

const BINS_PER_HOUR = 60 / BIN_MINUTES;

export function loginPropensity(racesScored: number, orgRaceCount: number): number {
  return (racesScored + 1) / (orgRaceCount + 2);
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function fitHabits(input: { spans: Span[]; orgRaceCount: number }): Habit | null {
  const density = fitDensity(input.spans);
  if (!density) return null;
  return describe(density, loginPropensity(input.spans.length, input.orgRaceCount), input.spans);
}

export function fitOrgFallback(input: { allSpans: Span[]; propensities: number[] }): Habit | null {
  if (input.propensities.length === 0) return null;
  const density = fitDensity(input.allSpans);
  if (!density) return null;
  return describe(density, median(input.propensities), input.allSpans);
}

function describe(density: Float32Array, login: number, spans: Span[]): Habit {
  const presence = presenceByBin(density);
  const hours = spans.reduce((s, x) => s + (x.departure - x.arrival), 0) / spans.length / 60;
  return {
    login_propensity: login,
    density,
    span_count: spans.length,
    avg_daily_race_hours: hours,
    peak_activity_window: peakWindow(presence),
    hourly_probability_array: Array.from({ length: 24 }, (_, h) => {
      let sum = 0;
      for (let b = h * BINS_PER_HOUR; b < (h + 1) * BINS_PER_HOUR; b++) sum += presence[b]!;
      return Math.max(0, (sum / BINS_PER_HOUR) * login);
    }),
  };
}

/** P(present in each bin | turns up): mass of every cell whose span covers the bin. */
export function presenceByBin(density: Float32Array): Float64Array {
  const diff = new Float64Array(GRID + 1);
  for (let x = 0; x < GRID; x++) {
    for (let y = x; y < GRID; y++) {
      const m = density[cellIndex(x, y)]!;
      if (m === 0) continue;
      diff[x] = diff[x]! + m;
      diff[y + 1] = diff[y + 1]! - m;
    }
  }
  const out = new Float64Array(GRID);
  let run = 0;
  for (let b = 0; b < GRID; b++) { run += diff[b]!; out[b] = run; }
  return out;
}

// Shortest run of bins holding half of all presence.
function peakWindow(presence: Float64Array): { start: string; end: string } {
  const total = presence.reduce((s, v) => s + v, 0);
  let best = { lo: 0, hi: GRID - 1 };
  let lo = 0, sum = 0;
  for (let hi = 0; hi < GRID; hi++) {
    sum += presence[hi]!;
    while (lo < hi && sum - presence[lo]! >= total / 2) { sum -= presence[lo]!; lo++; }
    if (sum >= total / 2 && hi - lo < best.hi - best.lo) best = { lo, hi };
  }
  return { start: formatClock(best.lo * BIN_MINUTES), end: formatClock((best.hi + 1) * BIN_MINUTES) };
}

/** Upper triangle scaled to its max, as little-endian uint16, base64. */
export function encodeDensity(density: Float32Array): string {
  let max = 0;
  for (let x = 0; x < GRID; x++) for (let y = x; y < GRID; y++) max = Math.max(max, density[cellIndex(x, y)]!);
  const bytes = new Uint8Array(TRI_CELLS * 2);
  let k = 0;
  for (let x = 0; x < GRID; x++) {
    for (let y = x; y < GRID; y++) {
      const q = max > 0 ? Math.round((density[cellIndex(x, y)]! / max) * 65535) : 0;
      bytes[k++] = q & 0xff;
      bytes[k++] = q >> 8;
    }
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
  }
  return btoa(binary);
}

/** Full grid, renormalised so the upper triangle sums to 1. */
export function decodeDensity(encoded: string): Float32Array {
  const binary = atob(encoded);
  if (binary.length !== TRI_CELLS * 2) throw new Error(`habit matrix is ${binary.length} bytes, expected ${TRI_CELLS * 2}`);
  const out = new Float32Array(GRID * GRID);
  let k = 0, total = 0;
  for (let x = 0; x < GRID; x++) {
    for (let y = x; y < GRID; y++) {
      const q = binary.charCodeAt(k) | (binary.charCodeAt(k + 1) << 8);
      k += 2;
      out[cellIndex(x, y)] = q;
      total += q;
    }
  }
  if (total > 0) for (let i = 0; i < out.length; i++) out[i] = out[i]! / total;
  return out;
}
