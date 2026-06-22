import type { SeriesPoint } from './api.js';

export function toCumulative(points: readonly SeriesPoint[]): { t: number; total: number }[] {
  let total = 0;
  return points.map((p) => {
    total += p.d;
    return { t: p.t, total };
  });
}

export function toThroughput(
  points: readonly SeriesPoint[],
  startMs: number,
): { t: number; perMin: number }[] {
  let prev = startMs;
  return points.map((p) => {
    const minutes = Math.max(p.t - prev, 1) / 60_000; // guard zero/negative gaps
    prev = p.t;
    return { t: p.t, perMin: Math.round(p.d / minutes) };
  });
}

export function bucketSeries(
  points: readonly SeriesPoint[],
  startMs: number,
  endMs: number,
  maxBuckets: number,
): SeriesPoint[] {
  if (points.length <= maxBuckets) return points.slice();
  const span = Math.max(endMs - startMs, 1);
  const bucketMs = Math.ceil(span / maxBuckets);
  const sums = new Map<number, number>();
  for (const p of points) {
    const idx = Math.min(Math.max(Math.floor((p.t - startMs) / bucketMs), 0), maxBuckets - 1);
    sums.set(idx, (sums.get(idx) ?? 0) + p.d);
  }
  return [...sums.keys()]
    .sort((a, b) => a - b)
    .map((idx) => ({ t: startMs + (idx + 1) * bucketMs, d: sums.get(idx)! }));
}
