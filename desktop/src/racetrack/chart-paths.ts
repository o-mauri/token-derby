// Ported unchanged from site/src/render/chart-paths.ts — pure SVG path/scale
// math, no browser coupling.
type Pt = readonly [number, number];

export function scale(value: number, dMin: number, dMax: number, rMin: number, rMax: number): number {
  if (dMax === dMin) return rMin;
  return rMin + ((value - dMin) / (dMax - dMin)) * (rMax - rMin);
}

export function linePath(pts: ReadonlyArray<Pt>): string {
  if (pts.length === 0) return '';
  return 'M' + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
}

export function smoothPath(pts: ReadonlyArray<Pt>): string {
  if (pts.length < 2) return linePath(pts);
  const first = pts[0]!;
  let d = `M${first[0].toFixed(1)},${first[1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}
