import type { MarketSnapshot } from '@token-derby/shared';
import { toPrice } from '@token-derby/shared';
import { esc } from '../../esc.js';
import { buildHorseSvg } from '../../sprite-svg.js';
import { LINE_PALETTE } from '../../render/race-chart.js';
import type { BoardHorse, ChartMarket } from './board.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type { ChartMarket };

export type ChartPoint = { bucket: number; price: number; x: number; y: number };

// Maps recorded snapshots to plot coordinates for one horse. The x domain
// spans the WHOLE history, not this horse's own buckets, so a late joiner
// starts partway across. Skips snapshots with no entry (or a null value).
export function chartPoints(
  history: MarketSnapshot[],
  horseId: string,
  market: ChartMarket,
  width: number,
  height: number,
): ChartPoint[] {
  if (history.length === 0) return [];
  let first = history[0]!.bucket;
  let last = first;
  for (const snap of history) {
    if (snap.bucket < first) first = snap.bucket;
    if (snap.bucket > last) last = snap.bucket;
  }
  const span = last - first;

  const rows: Array<{ bucket: number; price: number }> = [];
  for (const snap of history) {
    const entry = snap.prices.find((p) => p.horse_id === horseId);
    if (!entry) continue;
    const value = entry[market];
    if (value == null) continue;
    rows.push({ bucket: snap.bucket, price: value });
  }

  return rows.map((r) => ({
    bucket: r.bucket,
    price: r.price,
    x: span > 0 ? ((r.bucket - first) / span) * width : 0,
    y: (1 - r.price) * height,
  }));
}

// The price only exists where it was actually computed — never interpolate
// between recorded points, so hovering snaps to whichever is closest.
export function nearestPoint(points: ChartPoint[], x: number): ChartPoint {
  let best = points[0]!;
  let bestDist = Infinity;
  for (const p of points) {
    const d = Math.abs(p.x - x);
    if (d < bestDist) { bestDist = d; best = p; }
  }
  return best;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

// Below this Euclidean RGB distance two silks read as the same colour once
// reduced to a 1.2px line — several real horses are near-identical greys,
// which is fine for sprites and useless for telling lines apart.
const MIN_LINE_DISTANCE = 45;

// Every current theme's page background is within a few RGB units of this —
// a candidate this close to it would draw an invisible line, black silk included.
const BG_REFERENCE = '#050505';
const MIN_BG_DISTANCE = 40;

function unusable(candidate: string, used: readonly string[]): boolean {
  if (colorDistance(candidate, BG_REFERENCE) < MIN_BG_DISTANCE) return true;
  return used.some((c) => colorDistance(c, candidate) < MIN_LINE_DISTANCE);
}

// One line colour per horse: its own silk, or the next non-clashing palette
// slot. Bounded to one palette pass, so an all-identical field falls back to
// a repeated colour rather than spinning forever looking for a free one.
export function assignLineColors(horses: Array<{ horse_id: string; silk: string }>): Map<string, string> {
  const colorOf = new Map<string, string>();
  const used: string[] = [];
  let paletteStart = 0;
  for (const h of horses) {
    let color = h.silk;
    if (unusable(color, used)) {
      let idx = paletteStart;
      let tries = 0;
      while (tries < LINE_PALETTE.length && unusable(LINE_PALETTE[idx]!, used)) {
        idx = (idx + 1) % LINE_PALETTE.length;
        tries++;
      }
      color = LINE_PALETTE[idx]!;
      paletteStart = (idx + 1) % LINE_PALETTE.length;
    }
    used.push(color);
    colorOf.set(h.horse_id, color);
  }
  return colorOf;
}

// 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11 -> "11th" ...
function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const clockFmt = (bucketMin: number) =>
  new Date(bucketMin * 60_000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function svgEl(tag: string, attrs: Record<string, string> = {}): SVGElement {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

// Plot geometry, in viewBox units — a fixed right-hand gutter (X1..GW) holds
// the price readout clear of the y-axis labels on the left.
const GW = 940, GH = 236;
const X0 = 56, X1 = 878, Y0 = 16, Y1 = 196;
const PLOT_W = X1 - X0, PLOT_H = Y1 - Y0;

export type PriceChartRunner = { horse: BoardHorse; price: number };

export type PriceChartInput = {
  history: MarketSnapshot[];
  runners: PriceChartRunner[];   // pre-sorted by YES price, highest first
  market: ChartMarket;
  name: string;            // e.g. "To Win"
  meta: string;             // e.g. "8 runners"
  sectionHeading: string;    // e.g. "The race" or "Premier · 4 runners"
  divisionNames?: string[];
  onBack: () => void;
};

/** Renders the full-field price history chart plus one row per runner.
 *  Returns a dispose function (no timers/observers to tear down today, but
 *  kept for symmetry with renderBoard). */
export function renderPriceChart(root: HTMLElement, input: PriceChartInput): () => void {
  const { history, runners, market, name, meta, sectionHeading, divisionNames, onBack } = input;

  const colorOf = assignLineColors(runners.map((r) => ({ horse_id: r.horse.horse_id, silk: r.horse.colors.body })));
  const seriesByHorse = new Map(runners.map((r) => [r.horse.horse_id, chartPoints(history, r.horse.horse_id, market, PLOT_W, PLOT_H)]));

  const buckets = history.map((h) => h.bucket);
  const firstBucket = buckets.length ? Math.min(...buckets) : 0;
  const lastBucket = buckets.length ? Math.max(...buckets) : 0;

  // Division headings already carry a runner count ("Premier · 4 runners"),
  // so only append `meta` separately when the heading doesn't already say it.
  const metaLine = sectionHeading.includes(meta) ? sectionHeading : `${sectionHeading} · ${meta}`;

  root.innerHTML = `
    <div class="dm dm-pc">
      <div class="dm-pc-crumb"><button type="button" class="dm-pc-back">&larr; All markets</button></div>
      <div class="dm-pc-title">${esc(name)}</div>
      <div class="dm-pc-meta">${esc(metaLine)}</div>
      <div class="dm-pc-wrap">
        <svg class="dm-pc-svg" viewBox="0 0 ${GW} ${GH}" role="img" aria-label="${esc(name)} price history"></svg>
      </div>
      <div class="dm-pc-rows"></div>
    </div>`;

  root.querySelector<HTMLButtonElement>('.dm-pc-back')!.addEventListener('click', onBack);

  const svg = root.querySelector<SVGSVGElement>('svg.dm-pc-svg')!;
  const rowsEl = root.querySelector<HTMLElement>('.dm-pc-rows')!;

  // Gridlines + y-axis labels at 0 / 0.25 / 0.50 / 0.75 / 1.00.
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const y = Y0 + f * PLOT_H;
    svg.appendChild(svgEl('line', { class: 'dm-pc-grid', x1: String(X0), x2: String(X1), y1: String(y), y2: String(y) }));
  }
  const yLabel = (f: number, text: string) => {
    const t = svgEl('text', { class: 'dm-pc-axis', x: String(X0 - 6), y: String(Y0 + f * PLOT_H + 4), 'text-anchor': 'end' });
    t.textContent = text;
    svg.appendChild(t);
  };
  yLabel(0, '1.00');
  yLabel(0.5, '0.50');
  yLabel(1, '0');

  if (lastBucket > firstBucket) {
    const xLabel = (x: number, anchor: string, text: string) => {
      const t = svgEl('text', { class: 'dm-pc-axis', x: String(x), y: String(Y1 + 17), 'text-anchor': anchor });
      t.textContent = text;
      svg.appendChild(t);
    };
    xLabel(X0, 'start', clockFmt(firstBucket));
    xLabel((X0 + X1) / 2, 'middle', clockFmt(Math.round((firstBucket + lastBucket) / 2)));
    xLabel(X1, 'end', clockFmt(lastBucket));
  }

  const linesGroup = svgEl('g');
  svg.appendChild(linesGroup);

  const xhV = svgEl('line', { class: 'dm-pc-xh' });
  const xhH = svgEl('line', { class: 'dm-pc-xh' });
  const marker = svgEl('circle', { class: 'dm-pc-marker', r: '4.5' });
  const priceTagBg = svgEl('rect', { class: 'dm-pc-tagbg', rx: '2', height: '15', width: '40' });
  const priceTag = svgEl('text', { class: 'dm-pc-tag', 'text-anchor': 'middle' });
  const timeTagBg = svgEl('rect', { class: 'dm-pc-tagbg', rx: '2', height: '15', width: '46' });
  const timeTag = svgEl('text', { class: 'dm-pc-tag', 'text-anchor': 'middle' });
  const flag = svgEl('text', { class: 'dm-pc-flag', 'text-anchor': 'end' });
  for (const el of [xhV, xhH, marker, priceTagBg, priceTag, timeTagBg, timeTag, flag]) svg.appendChild(el);

  const hitsGroup = svgEl('g');
  svg.appendChild(hitsGroup); // topmost layer — receives pointer events

  const traces: SVGElement[] = [];
  const rowEls: HTMLElement[] = [];

  function bg(): string {
    return getComputedStyle(document.body).backgroundColor;
  }

  function hideCrosshair(): void {
    for (const el of [xhV, xhH, marker, priceTag, priceTagBg, timeTag, timeTagBg, flag]) el.classList.remove('on');
  }

  function readout(i: number, cursorLocalX: number | null): void {
    const r = runners[i]!;
    const points = seriesByHorse.get(r.horse.horse_id) ?? [];
    if (points.length === 0) { hideCrosshair(); return; }
    const color = colorOf.get(r.horse.horse_id)!;
    const point = cursorLocalX == null ? points[points.length - 1]! : nearestPoint(points, cursorLocalX);
    const x = X0 + point.x, y = Y0 + point.y;

    xhV.setAttribute('x1', String(x)); xhV.setAttribute('x2', String(x));
    xhV.setAttribute('y1', String(y)); xhV.setAttribute('y2', String(Y1));
    xhV.setAttribute('stroke', color); xhV.classList.add('on');

    xhH.setAttribute('x1', String(x)); xhH.setAttribute('x2', String(X1 + 4));
    xhH.setAttribute('y1', String(y)); xhH.setAttribute('y2', String(y));
    xhH.setAttribute('stroke', color); xhH.classList.add('on');

    marker.setAttribute('cx', String(x)); marker.setAttribute('cy', String(y));
    marker.setAttribute('fill', color); marker.setAttribute('stroke', bg());
    marker.classList.add('on');

    priceTag.textContent = toPrice(point.price).toFixed(2);
    priceTag.setAttribute('x', String(X1 + 34)); priceTag.setAttribute('y', String(y + 4));
    priceTag.setAttribute('fill', color); priceTag.classList.add('on');
    priceTagBg.setAttribute('x', String(X1 + 12)); priceTagBg.setAttribute('y', String(y - 8));
    priceTagBg.setAttribute('fill', color); priceTagBg.setAttribute('fill-opacity', '.16');
    priceTagBg.classList.add('on');

    const tx = Math.min(Math.max(x, X0 + 24), X1 - 24);
    timeTag.textContent = clockFmt(point.bucket);
    timeTag.setAttribute('x', String(tx)); timeTag.setAttribute('y', String(Y1 + 35));
    timeTag.setAttribute('fill', color); timeTag.classList.add('on');
    timeTagBg.setAttribute('x', String(tx - 23)); timeTagBg.setAttribute('y', String(Y1 + 24));
    timeTagBg.setAttribute('fill', color); timeTagBg.setAttribute('fill-opacity', '.16');
    timeTagBg.classList.add('on');

    flag.textContent = r.horse.name;
    flag.setAttribute('x', String(Math.min(x - 9, X1 - 4)));
    flag.setAttribute('y', String(Math.max(y - 11, 12)));
    flag.setAttribute('fill', color); flag.setAttribute('stroke', bg());
    flag.classList.add('on');
  }

  function focus(i: number, cursorLocalX: number | null): void {
    svg.classList.add('dm-pc-focused');
    traces.forEach((t, ti) => t.classList.toggle('on', ti === i));
    rowEls.forEach((row, ri) => row.classList.toggle('dm-pc-row--lit', ri === i));
    readout(i, cursorLocalX);
  }

  function blur(): void {
    svg.classList.remove('dm-pc-focused');
    traces.forEach((t) => t.classList.remove('on'));
    rowEls.forEach((row) => row.classList.remove('dm-pc-row--lit'));
    hideCrosshair();
  }

  function toLocalX(clientX: number): number {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return 0;
    return (clientX - rect.left) * (GW / rect.width) - X0;
  }

  runners.forEach((r, i) => {
    const points = seriesByHorse.get(r.horse.horse_id) ?? [];
    const color = colorOf.get(r.horse.horse_id)!;
    const pointsAttr = points.map((p) => `${(X0 + p.x).toFixed(1)},${(Y0 + p.y).toFixed(1)}`).join(' ');

    const trace = svgEl('polyline', { class: 'dm-pc-trace', points: pointsAttr, stroke: color });
    linesGroup.appendChild(trace);
    traces.push(trace);

    // Invisible ~11px hit-stroke, drawn above the visible lines — a 1.2px
    // path is unusable to hover directly.
    const hit = svgEl('polyline', { class: 'dm-pc-hit', points: pointsAttr });
    hit.setAttribute('data-i', String(i));
    hitsGroup.appendChild(hit);

    const row = buildRow(i, r, color, divisionNames);
    row.addEventListener('mouseenter', () => focus(i, null));
    row.addEventListener('mouseleave', blur);
    row.addEventListener('focus', () => focus(i, null));
    row.addEventListener('blur', blur);
    rowsEl.appendChild(row);
    rowEls.push(row);
  });

  hitsGroup.addEventListener('mousemove', (e) => {
    const target = e.target as SVGElement;
    if (!target.classList || !target.classList.contains('dm-pc-hit')) return;
    const i = Number(target.getAttribute('data-i'));
    focus(i, toLocalX((e as MouseEvent).clientX));
  });
  hitsGroup.addEventListener('mouseleave', blur);

  return () => {};
}

function buildRow(
  i: number, r: PriceChartRunner, color: string, divisionNames: string[] | undefined,
): HTMLElement {
  const h = r.horse;
  // The live snapshot price the user just clicked on the board, not the
  // (possibly several-minutes-stale) last history bucket — the row must
  // agree with what's on the board.
  const p = r.price;

  // A focusable div, not a button: hovering/focusing it only highlights the
  // matching line, it has no action of its own to advertise.
  const row = document.createElement('div');
  row.tabIndex = 0;
  row.className = 'dm-pc-row';
  row.dataset.i = String(i);
  row.style.setProperty('--silk', color);

  const spriteWrap = document.createElement('div');
  spriteWrap.className = 'dm-pc-sprite';
  spriteWrap.style.setProperty('--body', h.colors.body);
  spriteWrap.style.setProperty('--mane', h.colors.mane);
  spriteWrap.style.setProperty('--tail', h.colors.tail);
  spriteWrap.style.setProperty('--saddle', h.colors.saddle);
  spriteWrap.appendChild(buildHorseSvg(document));
  row.appendChild(spriteWrap);

  const who = document.createElement('div');
  who.className = 'dm-pc-who';
  const nm = document.createElement('div');
  nm.className = 'dm-pc-name';
  const silk = document.createElement('i');
  silk.className = 'dm-pc-silk';
  silk.style.background = color;
  nm.appendChild(silk);
  nm.appendChild(document.createTextNode(h.name));
  who.appendChild(nm);
  const sub = document.createElement('div');
  sub.className = 'dm-pc-sub';
  const bits = [h.jockey, h.rank != null ? `currently ${ordinal(h.rank)}` : null].filter((v): v is string => !!v);
  sub.textContent = bits.join(' · ');
  who.appendChild(sub);
  row.appendChild(who);

  const divchip = document.createElement('div');
  divchip.className = 'dm-pc-div';
  const divLabel = h.division != null ? (divisionNames?.[h.division - 1] ?? `Division ${h.division}`) : '';
  divchip.textContent = divLabel;
  if (!divLabel) divchip.hidden = true;
  row.appendChild(divchip);

  const banked = document.createElement('div');
  banked.className = 'dm-pc-banked';
  const bv = document.createElement('div');
  bv.className = 'v';
  bv.textContent = compactFmt.format(h.banked ?? 0);
  const bl = document.createElement('div');
  bl.className = 'l';
  bl.textContent = 'banked';
  banked.append(bv, bl);
  row.appendChild(banked);

  const prices = document.createElement('div');
  prices.className = 'dm-pc-prices';
  prices.appendChild(priceBox('yes', 'Yes', toPrice(p)));
  prices.appendChild(priceBox('no', 'No', toPrice(1 - p)));
  row.appendChild(prices);

  return row;
}

function priceBox(cls: string, label: string, value: number): HTMLElement {
  const box = document.createElement('div');
  box.className = `dm-pc-price dm-pc-${cls}`;
  const lb = document.createElement('div');
  lb.className = 'lb';
  lb.textContent = label;
  const vv = document.createElement('div');
  vv.className = 'vv';
  vv.textContent = value.toFixed(2);
  box.append(lb, vv);
  return box;
}
