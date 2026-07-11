import type { SeriesPoint } from './api.js';

export type TickPoint = {
  t: number;       // tick boundary (epoch ms); first entry is the window-start anchor
  total: number;   // cumulative tokens up to and including this tick (carried forward when idle)
  perMin: number;  // tokens per minute during this tick (0 when idle)
};

export const TICK_MS = 60_000; // 1 minute
export const PACE_WINDOW_MS = 15 * 60_000; // trailing pace window: 15 minutes
export const PACE_SMOOTH_WINDOW_MIN = 30; // end-of-race pace graph: trailing moving-average window

/**
 * Trailing simple moving average. `out[i]` is the mean of `values` over the
 * trailing window ending at `i`. The window ramps up from 1 sample at the start
 * to `maxWindow` (so the leading points are averaged over however many samples
 * exist — no gaps) and then stays fixed at `maxWindow`. O(n) via a sliding sum.
 */
export function trailingMovingAverage(values: readonly number[], maxWindow: number): number[] {
  if (maxWindow < 1) throw new Error('maxWindow must be >= 1');
  const out = new Array<number>(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= maxWindow) sum -= values[i - maxWindow]!;
    const count = Math.min(i + 1, maxWindow);
    out[i] = sum / count;
  }
  return out;
}

/**
 * Instantaneous token pace (tokens/min) over the trailing `windowMs`, computed
 * from raw series points. Sums the deltas whose timestamp is within the window
 * and divides by the window's minutes. Callers should clamp `windowMs` to the
 * race's age (`min(PACE_WINDOW_MS, now - raceStart)`) so a young race isn't
 * deflated by dividing partial output over the full 15 minutes. Returns null
 * when the window is under a minute — too little elapsed race to measure.
 */
export function trailingPace(
  points: readonly SeriesPoint[],
  nowMs: number,
  windowMs: number = PACE_WINDOW_MS,
): number | null {
  if (windowMs < 60_000) return null;
  const cutoff = nowMs - windowMs;
  let sum = 0;
  for (const p of points) if (p.t >= cutoff) sum += p.d;
  return Math.round(sum / (windowMs / 60_000));
}

/**
 * Resample a horse's raw, irregularly-spaced token points onto a uniform tick
 * grid spanning [startMs, endMs]. Every horse sampled this way shares the same
 * x-grid, so lines line up. Within each tick the deltas are summed; the
 * cumulative total carries forward across idle ticks (flat line) while the
 * per-minute pace drops to 0. The first entry is a zero anchor at the window
 * start so the cumulative line begins at the left edge.
 */
export function resampleToTicks(
  points: readonly SeriesPoint[],
  startMs: number,
  endMs: number,
  tickMs: number = TICK_MS,
): TickPoint[] {
  const span = Math.max(endMs - startMs, tickMs);
  const ticks = Math.ceil(span / tickMs);

  const perTick = new Array<number>(ticks).fill(0);
  for (const p of points) {
    const idx = Math.min(Math.max(Math.floor((p.t - startMs) / tickMs), 0), ticks - 1);
    perTick[idx] = perTick[idx]! + p.d;
  }

  const minutesPerTick = tickMs / 60_000;
  const out: TickPoint[] = [{ t: startMs, total: 0, perMin: 0 }];
  let total = 0;
  for (let i = 0; i < ticks; i++) {
    total += perTick[i]!;
    out.push({
      t: startMs + (i + 1) * tickMs,
      total,
      perMin: Math.round(perTick[i]! / minutesPerTick),
    });
  }
  return out;
}
