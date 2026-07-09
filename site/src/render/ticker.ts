import type { GetRaceResponse, HorseView } from '@token-derby/shared';
import { describeAchievement } from '@token-derby/shared';

export type TickerItem = {
  horseName: string;
  name: string;
  description: string;
  xp: number;
};

// Leader shows their absolute token count; everyone else shows the (non-negative)
// gap down to that leader, rendered with a real minus sign (U+2212).
export function formatOrderValue(isLeader: boolean, tokens: number, leaderTokens: number): string {
  if (isLeader) return tokens.toLocaleString();
  return `−${Math.max(0, leaderTokens - tokens).toLocaleString()}`;
}

export function renderOrderItem(
  doc: Document,
  cell: { position: number; horseName: string; valueText: string; isLeader: boolean },
): HTMLElement {
  const root = doc.createElement('div');
  root.className = 'ticker-order';

  const pos = doc.createElement('span');
  pos.className = 'ticker-order-pos';
  pos.textContent = `${cell.position}.`;
  root.appendChild(pos);

  const name = doc.createElement('span');
  name.className = 'ticker-order-name';
  name.textContent = cell.horseName;
  root.appendChild(name);

  const val = doc.createElement('span');
  val.className = cell.isLeader ? 'ticker-order-val ticker-order-val--leader' : 'ticker-order-val';
  val.textContent = cell.valueText;
  root.appendChild(val);

  return root;
}

// Pull every recent_event newer than the per-horse watermark into a flat,
// render-ready batch, advancing the watermark in place. Descriptions are
// race-aware: when the race counts input tokens, the Stampede!/Pulled Away!
// thresholds are scaled by the input multiplier to match the CLI. Returns []
// when the snapshot carries nothing new (in which case the ticker keeps its
// last batch rolling rather than going blank).
export function collectFreshItems(
  race: GetRaceResponse,
  shownAt: Map<string, number>,
): TickerItem[] {
  const items: TickerItem[] = [];
  for (const horse of race.horses) {
    const watermark = shownAt.get(horse.horse_id) ?? 0;
    const fresh = (horse.recent_events ?? []).filter((e) => e.at > watermark);
    if (fresh.length === 0) continue;
    shownAt.set(horse.horse_id, Math.max(...fresh.map((e) => e.at)));
    for (const ev of fresh) {
      items.push({
        horseName: horse.name,
        name: ev.name,
        description: describeAchievement(ev, race),
        xp: ev.xp,
      });
    }
  }
  return items;
}

export function renderTickerItem(doc: Document, item: TickerItem): HTMLElement {
  const root = doc.createElement('div');
  root.className = 'achievement-ticker-item';

  const xp = doc.createElement('span');
  xp.className = 'achievement-ticker-xp';
  xp.textContent = `+${item.xp} XP`;
  root.appendChild(xp);

  const name = doc.createElement('span');
  name.className = 'achievement-ticker-horse';
  name.textContent = item.horseName;
  root.appendChild(name);

  const ach = doc.createElement('span');
  ach.className = 'achievement-ticker-name';
  ach.textContent = item.name;
  root.appendChild(ach);

  const desc = doc.createElement('span');
  desc.className = 'achievement-ticker-desc';
  desc.textContent = item.description;
  root.appendChild(desc);

  return root;
}

// Bullet shown between achievements within a single pass.
export function renderTickerSep(doc: Document): HTMLElement {
  const sep = doc.createElement('div');
  sep.className = 'achievement-ticker-sep';
  sep.setAttribute('aria-hidden', 'true');
  sep.textContent = '•';
  return sep;
}

// A ticker pass is a list of cells. `createTicker` walks them cyclically and
// appends its own dynamic loop-seam after the last cell (see setCells).
export type TickerCell =
  | { kind: 'achievement'; item: TickerItem }
  | { kind: 'order'; position: number; horseName: string; valueText: string; isLeader: boolean }
  | { kind: 'label'; text: string; groupClass?: string }
  | { kind: 'sep' }        // "•" between achievements
  | { kind: 'groupsep' }   // "│" between order groups (divisions)
  | { kind: 'sectiongap'; wide?: boolean }; // gap between the order and achievement sections (wide for league)

// A contiguous run of the order, optionally labelled. `horses` MUST already be in
// display order (leader first) — callers sort. This is the grouping extension
// point: standard races pass one unlabelled group; League Mode passes one
// labelled group per division.
export type OrderGroup = { label?: { text: string; groupClass?: string }; horses: HorseView[] };

// Same ordering the track and finish ranking use: server rank, then tokens desc,
// then earlier join. The tokens tie-break keeps previews (where every rank is 0)
// sensible without any server change.
export function sortByRank(horses: HorseView[]): HorseView[] {
  return [...horses].sort((a, b) =>
    (a.rank - b.rank) ||
    (b.current_tokens - a.current_tokens) ||
    (a.joined_at < b.joined_at ? -1 : a.joined_at > b.joined_at ? 1 : 0),
  );
}

export function singleGroupOrder(horses: HorseView[]): OrderGroup[] {
  return [{ horses: sortByRank(horses) }];
}

export function composeOrderCells(groups: OrderGroup[]): TickerCell[] {
  const cells: TickerCell[] = [];
  groups.forEach((group, gi) => {
    if (gi > 0) cells.push({ kind: 'groupsep' });
    if (group.label) cells.push({ kind: 'label', text: group.label.text, groupClass: group.label.groupClass });
    const leaderTokens = group.horses[0]?.current_tokens ?? 0;
    group.horses.forEach((h, i) => {
      cells.push({
        kind: 'order',
        position: i + 1,
        horseName: h.name,
        valueText: formatOrderValue(i === 0, h.current_tokens, leaderTokens),
        isLeader: i === 0,
      });
    });
  });
  return cells;
}

export function liveOrderCells(race: GetRaceResponse): TickerCell[] {
  return composeOrderCells(singleGroupOrder(race.horses));
}

// League fixtures group the order by division (top→bottom) with real-name labels
// and colour chips; standard races fall back to one flat group. Empty divisions
// are skipped. Uses the OrderGroup extension point.
export function leagueOrderCells(race: GetRaceResponse): TickerCell[] {
  const names = race.league_division_names;
  if (!race.league_id || !names) return composeOrderCells(singleGroupOrder(race.horses));
  const byDiv = new Map<number, HorseView[]>();
  for (const h of race.horses) {
    const d = h.division ?? names.length; // unscored entrant → bottom division
    const arr = byDiv.get(d) ?? [];
    arr.push(h);
    byDiv.set(d, arr);
  }
  const groups: OrderGroup[] = [];
  for (let d = 1; d <= names.length; d++) {
    const hs = byDiv.get(d);
    if (!hs || hs.length === 0) continue;
    groups.push({ label: { text: names[d - 1]!, groupClass: `ticker-div-${((d - 1) % 3) + 1}` }, horses: sortByRank(hs) });
  }
  return composeOrderCells(groups);
}

// The loop seam: a wide blank break marking the end of one pass and the start
// of the next, so a repeating batch reads as a repeat rather than as distinct
// achievements. Its width is set dynamically by the ticker.
export function renderTickerGap(doc: Document): HTMLElement {
  const gap = doc.createElement('div');
  gap.className = 'achievement-ticker-gap';
  gap.setAttribute('aria-hidden', 'true');
  return gap;
}

export function renderGroupLabel(doc: Document, cell: { text: string; groupClass?: string }): HTMLElement {
  const el = doc.createElement('span');
  el.className = cell.groupClass ? `ticker-group-label ${cell.groupClass}` : 'ticker-group-label';
  el.textContent = cell.text;
  return el;
}

export function renderGroupSep(doc: Document): HTMLElement {
  const el = doc.createElement('span');
  el.className = 'ticker-group-sep';
  el.setAttribute('aria-hidden', 'true');
  el.textContent = '│';
  return el;
}

export function renderSectionGap(doc: Document, wide = false): HTMLElement {
  const el = doc.createElement('div');
  el.className = wide ? 'ticker-section-gap ticker-section-gap--wide' : 'ticker-section-gap';
  el.setAttribute('aria-hidden', 'true');
  return el;
}

export function buildCellNode(doc: Document, cell: TickerCell): HTMLElement {
  switch (cell.kind) {
    case 'achievement': return renderTickerItem(doc, cell.item);
    case 'order': return renderOrderItem(doc, cell);
    case 'label': return renderGroupLabel(doc, cell);
    case 'sep': return renderTickerSep(doc);
    case 'groupsep': return renderGroupSep(doc);
    case 'sectiongap': return renderSectionGap(doc, cell.wide);
  }
}

export type Ticker = {
  el: HTMLElement;
  /**
   * Replace the looping content. Items already on screen keep scrolling off the
   * left; everything appended from here on comes from `cells`. Pass `[]` to let
   * the ticker drain to empty (e.g. when the race is not live).
   */
  setCells(cells: TickerCell[]): void;
  destroy(): void;
};

const SPEED_PX_PER_S = 70;
const FILL_BUFFER_PX = 96; // keep this much content past the right edge
const MIN_GAP_PX = 140;        // loop-seam floor for a standard (flat) ticker
const MIN_GAP_PX_LEAGUE = 600; // wider floor for the league order (division groups) so it doesn't tile

export function createTicker(doc: Document): Ticker {
  const el = doc.createElement('div');
  el.className = 'achievement-ticker is-empty';

  const track = doc.createElement('div');
  track.className = 'achievement-ticker-track';
  el.appendChild(track);

  let cells: TickerCell[] = [];
  let cursor = 0;
  let seamFloor = MIN_GAP_PX; // widened to MIN_GAP_PX_LEAGUE when the batch has division groups
  let pos = 0; // px the track has scrolled to the left
  let widthSinceSeam = 0; // width emitted since the last loop-seam gap
  let mounted: { node: HTMLElement; width: number }[] = [];
  let paused = false;
  let lastT = 0;
  let raf: number | null = null;

  const win = (doc.defaultView ?? window) as Window;

  el.addEventListener('mouseenter', () => { paused = true; });
  el.addEventListener('mouseleave', () => { paused = false; });

  // Emit one node per call, cycling through `cells` and appending a single
  // stretchable loop-seam after the final cell so each pass clears the viewport.
  function appendNext(): boolean {
    if (cells.length === 0) return false;
    const period = cells.length + 1; // cells + one loop-seam
    const slot = cursor % period;
    cursor++;

    const isSeam = slot === cells.length;
    const node: HTMLElement = isSeam ? renderTickerGap(doc) : buildCellNode(doc, cells[slot]!);

    track.appendChild(node);
    let width = Math.max(1, node.offsetWidth);

    if (isSeam) {
      // Stretch the gap so one full pass spans at least the viewport — a short
      // batch fully clears the screen before it repeats, instead of tiling.
      const viewport = el.clientWidth || 0;
      width = Math.max(seamFloor, viewport - widthSinceSeam + seamFloor);
      node.style.width = `${width}px`;
      widthSinceSeam = 0;
    } else {
      widthSinceSeam += width;
    }

    mounted.push({ node, width });
    return true;
  }

  function contentWidth(): number {
    let w = 0;
    for (const m of mounted) w += m.width;
    return w;
  }

  function frame(t: number) {
    raf = win.requestAnimationFrame(frame);
    if (!lastT) lastT = t;
    const dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    if (!paused) pos += SPEED_PX_PER_S * dt;

    // Drop items that have fully scrolled past the left edge, keeping `pos`
    // bounded so it never overflows over a long-running race.
    while (mounted.length && mounted[0]!.width <= pos) {
      const first = mounted.shift()!;
      if (first.node.parentNode === track) track.removeChild(first.node);
      pos -= first.width;
    }

    // Keep the right edge covered. Bounded so a momentarily-unmeasured node
    // (width 0 → clamped to 1) can't spin forever.
    const viewport = el.clientWidth || 0;
    for (let guard = 0; guard < 200; guard++) {
      if (contentWidth() - pos >= viewport + FILL_BUFFER_PX) break;
      if (!appendNext()) break;
    }

    el.classList.toggle('is-empty', mounted.length === 0);
    track.style.transform = `translateX(${-pos}px)`;
  }

  raf = win.requestAnimationFrame(frame);

  return {
    el,
    setCells(next: TickerCell[]) {
      cells = next.slice();
      cursor = 0;
      widthSinceSeam = 0;
      // League batches carry division-group labels — widen the loop seam so the
      // grouped order gets its ≥600px breathing room. Standard (flat) tickers keep
      // the original floor, unchanged.
      seamFloor = next.some((c) => c.kind === 'label') ? MIN_GAP_PX_LEAGUE : MIN_GAP_PX;
    },
    destroy() {
      if (raf !== null) win.cancelAnimationFrame(raf);
      raf = null;
      mounted = [];
      track.replaceChildren();
    },
  };
}
