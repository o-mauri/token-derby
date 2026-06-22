import type { SeriesPoint } from './api.js';

export type TickPoint = {
  t: number;       // tick boundary (epoch ms); first entry is the window-start anchor
  total: number;   // cumulative tokens up to and including this tick (carried forward when idle)
  perMin: number;  // tokens per minute during this tick (0 when idle)
};

export const TICK_MS = 60_000; // 1 minute

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
