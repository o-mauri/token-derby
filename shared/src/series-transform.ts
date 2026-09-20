import type { SeriesPoint } from './api.js';

export type TickPoint = {
  t: number;       // tick boundary (epoch ms); first entry is the window-start anchor
  // Cumulative SCORED distance up to and including this tick, carried forward
  // when idle. This is the quantity a horse is ranked and positioned by, so a
  // cumulative chart drawn from it agrees with the race beside it.
  total: number;
  // RAW tokens per minute during this tick (0 when idle). Production, not
  // distance: it is what a player compares against a sustainable pace, and what
  // stamina itself measures, so a tiring horse still reads its true output here.
  perMin: number;
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
 * Instantaneous token pace (tokens/min) over the trailing `windowMs`.
 *
 * Deliberately RAW, not scored: this is what a player compares against the
 * race's sustainable pace, and the number stamina itself drains from. A tiring
 * horse should still see how fast it is actually going.
 *
 * Sums the deltas whose timestamp is within the window and divides by the
 * window's minutes. Callers should clamp `windowMs` to the race's age
 * (`min(PACE_WINDOW_MS, now - raceStart)`) so a young race isn't deflated by
 * dividing partial output over the full 15 minutes. Returns null when the
 * window is under a minute — too little elapsed race to measure.
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
 * Resample a horse's irregularly-spaced token points onto a uniform tick grid
 * spanning [startMs, endMs]. Every horse sampled this way shares the same
 * x-grid, so lines line up.
 *
 * The two outputs are deliberately different quantities: `total` accumulates
 * SCORED distance, so it matches the horse's position and rank, while `perMin`
 * reports RAW production. On a race running no mechanics they are the same
 * numbers; on a stamina race a tiring horse's line flattens while its pace
 * does not, which is the mechanic being visible rather than a discrepancy.
 *
 * The cumulative total carries forward across idle ticks (flat line) while the
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

  const rawPerTick = new Array<number>(ticks).fill(0);
  const scoredPerTick = new Array<number>(ticks).fill(0);
  for (const p of points) {
    const idx = Math.min(Math.max(Math.floor((p.t - startMs) / tickMs), 0), ticks - 1);
    rawPerTick[idx] = rawPerTick[idx]! + p.d;
    // A point written before scored distance was recorded has no `s`; reading
    // it as `d` is exactly right, since nothing had modified it.
    scoredPerTick[idx] = scoredPerTick[idx]! + (p.s ?? p.d);
  }

  const minutesPerTick = tickMs / 60_000;
  const out: TickPoint[] = [{ t: startMs, total: 0, perMin: 0 }];
  let total = 0;
  for (let i = 0; i < ticks; i++) {
    total += scoredPerTick[i]!;
    out.push({
      t: startMs + (i + 1) * tickMs,
      total,
      perMin: Math.round(rawPerTick[i]! / minutesPerTick),
    });
  }
  return out;
}
