import type { GetRaceSeriesResponse, HorseView, SeriesPoint } from '@token-derby/shared';
import { PACE_SMOOTH_WINDOW_MIN, resampleToTicks, trailingMovingAverage } from '@token-derby/shared';
import { scale, smoothPath } from './chart-paths';

export type ChartMode = 'cumulative' | 'throughput';

// Drawing height is fixed; width follows the box so the chart fills wide boxes instead of letterboxing.
export const CHART_H = 300;
export const CHART_W = 600;
const PAD_L = 40, PAD_R = 16, PAD_T = 20, PAD_B = 36;

// Distinct, well-separated line colours, so every horse is tellable apart whatever its own colours.
export const LINE_PALETTE = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
  '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#a9a9a9', '#ffffff',
];

export function lineColor(rankIndex: number): string {
  return LINE_PALETTE[rankIndex % LINE_PALETTE.length]!;
}

/** Never narrower than square, so labels don't crowd on a tall box. */
export function fitWidth(boxW: number, boxH: number): number {
  return Math.max(CHART_H, Math.round((CHART_H * boxW) / boxH));
}

/** Colour per horse by sorted id, so overtakes never reshuffle colours and every viewer sees the same mapping. */
export function colourMap(horses: readonly HorseView[]): Map<string, string> {
  const ids = horses.map((h) => h.horse_id).sort();
  return new Map(ids.map((id, i) => [id, LINE_PALETTE[i % LINE_PALETTE.length]!]));
}

/** A live chart ends at now, never before the newest point (clock skew) nor past the scheduled end. */
export function windowEnd(series: GetRaceSeriesResponse, nowMs: number): number {
  const latest = Math.max(series.start_ms, ...series.horses.flatMap((h) => h.points.map((p) => p.t)));
  return Math.min(series.end_ms, Math.max(nowMs, latest));
}

export type ChartLine = { readonly id: string; readonly name: string; readonly colour: string; readonly vals: readonly { t: number; v: number }[] };
export type ChartLines = { readonly lines: readonly ChartLine[]; readonly maxV: number; readonly hasData: boolean; readonly startMs: number; readonly endMs: number };

// One-minute ticks; idle ticks carry the total forward and report 0 pace, so every horse shares one x-grid.
// Pace is smoothed with a trailing 30-min average so it reads as a trend, not a per-minute sawtooth.
function valuesFor(mode: ChartMode, points: readonly SeriesPoint[], startMs: number, endMs: number): { t: number; v: number }[] {
  const ticks = resampleToTicks(points, startMs, endMs);
  if (mode === 'cumulative') return ticks.map((p) => ({ t: p.t, v: p.total }));
  const [anchor, ...minutes] = ticks;
  const smoothed = trailingMovingAverage(minutes.map((p) => p.perMin), PACE_SMOOTH_WINDOW_MIN);
  return [{ t: anchor!.t, v: 0 }, ...minutes.map((p, i) => ({ t: p.t, v: smoothed[i]! }))];
}

/** Each horse's line in rank order. Colours come from `colourOf`, or the palette by rank. */
export function chartLines(
  mode: ChartMode, series: GetRaceSeriesResponse, horses: readonly HorseView[], endMs: number,
  colourOf?: (h: HorseView) => string,
): ChartLines {
  const byId = new Map(series.horses.map((h) => [h.horse_id, h.points]));
  const ranked = [...horses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const lines = ranked.map((h, i) => ({
    id: h.horse_id, name: h.name, colour: colourOf?.(h) ?? lineColor(i),
    vals: valuesFor(mode, byId.get(h.horse_id) ?? [], series.start_ms, endMs),
  }));
  return {
    lines,
    maxV: Math.max(1, ...lines.flatMap((l) => l.vals.map((p) => p.v))),
    hasData: series.horses.some((h) => h.points.length > 0),
    startMs: series.start_ms,
    endMs,
  };
}

export type ChartGeometry = {
  readonly width: number;
  readonly grid: readonly number[];
  readonly lines: readonly { id: string; colour: string; d: string; points: string }[];
  readonly startLabel: string;
  readonly endLabel: string;
  readonly peakLabel: string;
  readonly pad: { readonly l: number; readonly r: number; readonly t: number; readonly b: number };
};

const fmtClock = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** The SVG geometry for a chart drawn `width` wide: cumulative as smooth paths, pace as polylines. */
export function chartGeometry(c: ChartLines, mode: ChartMode, width: number): ChartGeometry {
  const sx = (t: number) => scale(t, c.startMs, c.endMs, PAD_L, width - PAD_R);
  const sy = (v: number) => scale(v, 0, c.maxV, CHART_H - PAD_B, PAD_T);
  return {
    width,
    grid: [PAD_T, (PAD_T + (CHART_H - PAD_B)) / 2, CHART_H - PAD_B],
    lines: c.lines.map((l) => {
      const pts: [number, number][] = l.vals.map((p) => [sx(p.t), sy(p.v)]);
      return {
        id: l.id,
        colour: l.colour,
        d: mode === 'cumulative' ? smoothPath(pts) : '',
        points: mode === 'throughput' ? pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ') : '',
      };
    }),
    startLabel: fmtClock(c.startMs),
    endLabel: fmtClock(c.endMs),
    peakLabel: mode === 'cumulative' ? `${Math.round(c.maxV)}` : `${Math.round(c.maxV)}/m`,
    pad: { l: PAD_L, r: PAD_R, t: PAD_T, b: PAD_B },
  };
}
