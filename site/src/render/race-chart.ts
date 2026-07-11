import type { GetRaceSeriesResponse, HorseView, SeriesPoint } from '@token-derby/shared';
import { resampleToTicks, trailingMovingAverage, PACE_SMOOTH_WINDOW_MIN } from '@token-derby/shared';
import { scale, smoothPath } from './chart-paths.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 600, H = 300, PAD_L = 40, PAD_R = 16, PAD_T = 20, PAD_B = 36;

// Distinct, well-separated line colours assigned by finishing rank — so every
// horse is tellable apart on the graph regardless of its own (possibly similar)
// stable colours. Cycles if a race has more horses than the palette.
export const LINE_PALETTE = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
  '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
  '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000',
  '#aaffc3', '#808000', '#ffd8b1', '#a9a9a9', '#ffffff',
];

export function lineColor(rankIndex: number): string {
  return LINE_PALETTE[rankIndex % LINE_PALETTE.length]!;
}

type Mode = 'cumulative' | 'throughput';

function el(doc: Document, tag: string, attrs: Record<string, string>): SVGElement {
  const n = doc.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Resample a horse onto the shared 1-minute tick grid and pull the values for
// the chosen mode, as {t, v} pairs. Idle ticks carry the cumulative total
// forward and report 0 pace, so all horses line up on the same x-grid.
//
// Throughput is smoothed with a trailing moving average (window ramps 1..30 min
// then holds at 30) so the end-of-race pace graph reads as a trend rather than
// a jagged per-minute sawtooth. The leading start anchor stays at 0 (line begins
// at the left edge, matching the cumulative face); the ramp-up applies to the
// real minute ticks after it, so there are no gaps.
function valuesFor(
  mode: Mode, points: readonly SeriesPoint[], startMs: number, endMs: number,
): { t: number; v: number }[] {
  const ticks = resampleToTicks(points, startMs, endMs);
  if (mode === 'cumulative') {
    return ticks.map((p) => ({ t: p.t, v: p.total }));
  }
  const [anchor, ...minuteTicks] = ticks;
  const smoothed = trailingMovingAverage(minuteTicks.map((p) => p.perMin), PACE_SMOOTH_WINDOW_MIN);
  return [
    { t: anchor!.t, v: 0 },
    ...minuteTicks.map((p, i) => ({ t: p.t, v: smoothed[i]! })),
  ];
}

function buildFace(
  doc: Document, mode: Mode, series: GetRaceSeriesResponse, horses: readonly HorseView[],
): HTMLElement {
  const byId = new Map(series.horses.map((h) => [h.horse_id, h.points]));
  const ranked = [...horses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));

  const valuesByHorse = ranked.map((h) => ({ h, vals: valuesFor(mode, byId.get(h.horse_id) ?? [], series.start_ms, series.end_ms) }));
  const maxV = Math.max(1, ...valuesByHorse.flatMap((x) => x.vals.map((p) => p.v)));

  const svg = el(doc, 'svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg' });
  // gridlines
  for (const y of [PAD_T, (PAD_T + (H - PAD_B)) / 2, H - PAD_B]) {
    svg.appendChild(el(doc, 'line', { x1: `${PAD_L}`, y1: `${y}`, x2: `${W - PAD_R}`, y2: `${y}`, class: 'chart-grid' }));
  }
  const sx = (t: number) => scale(t, series.start_ms, series.end_ms, PAD_L, W - PAD_R);
  const sy = (v: number) => scale(v, 0, maxV, H - PAD_B, PAD_T);

  valuesByHorse.forEach(({ vals }, i) => {
    const stroke = lineColor(i);
    // Idle horses resample to an all-zero tick series, so this is naturally a
    // flat baseline at y=0 spanning the window — no special-casing needed.
    const pts: [number, number][] = vals.map((p) => [sx(p.t), sy(p.v)]);
    if (mode === 'cumulative') {
      svg.appendChild(el(doc, 'path', { d: smoothPath(pts), fill: 'none', stroke, 'stroke-width': '2', class: 'chart-line' }));
    } else {
      svg.appendChild(el(doc, 'polyline', { points: pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '), fill: 'none', stroke, 'stroke-width': '1.7', class: 'chart-line' }));
    }
  });
  // axis labels
  const axis = (x: number, y: number, text: string) => {
    const t = el(doc, 'text', { x: `${x}`, y: `${y}`, class: 'chart-axis' });
    t.textContent = text;
    svg.appendChild(t);
  };
  axis(PAD_L, H - 8, fmtClock(series.start_ms));
  axis(W - PAD_R - 30, H - 8, fmtClock(series.end_ms));
  axis(2, PAD_T + 6, mode === 'cumulative' ? `${Math.round(maxV)}` : `${Math.round(maxV)}/m`);

  // face wrapper: title + chart + legend
  const face = doc.createElement('div');
  face.className = 'detail-face chart-face';
  const title = doc.createElement('div');
  title.className = 'chart-title';
  title.textContent = mode === 'cumulative' ? 'Cumulative tokens' : 'Tokens / min (30-min avg)';
  face.appendChild(title);
  face.appendChild(svg);

  const legend = doc.createElement('div');
  legend.className = 'chart-legend';
  ranked.forEach((h, i) => {
    const item = doc.createElement('span');
    item.className = 'legend-item';
    const chip = doc.createElement('span');
    chip.className = 'legend-chip';
    chip.style.background = lineColor(i);
    item.appendChild(chip);
    item.appendChild(doc.createTextNode(h.name));
    legend.appendChild(item);
  });
  face.appendChild(legend);
  return face;
}

export function buildChartFaces(
  doc: Document, series: GetRaceSeriesResponse, horses: readonly HorseView[],
): HTMLElement[] {
  const hasData = series.horses.some((h) => h.points.length > 0);
  if (!hasData) return [];
  return [buildFace(doc, 'cumulative', series, horses), buildFace(doc, 'throughput', series, horses)];
}
