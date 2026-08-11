import type { GetRaceResponse, HorseView, SeasonStandings } from '@token-derby/shared';
import { describeAchievement, leaguePoints, scoredOf } from '@token-derby/shared';

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

// A league-standings cell: the horse's projected season total after this race
// (current points + points this position would earn), with the gain in brackets.
export function renderStandingItem(
  doc: Document,
  cell: { position: number; horseName: string; total: number; gain: number; isLeader: boolean },
): HTMLElement {
  const root = doc.createElement('div');
  root.className = 'ticker-standing';

  const pos = doc.createElement('span');
  pos.className = 'ticker-standing-pos';
  pos.textContent = `${cell.position}.`;
  root.appendChild(pos);

  const name = doc.createElement('span');
  name.className = 'ticker-standing-name';
  name.textContent = cell.horseName;
  root.appendChild(name);

  const total = doc.createElement('span');
  total.className = cell.isLeader
    ? 'ticker-standing-total ticker-standing-total--leader'
    : 'ticker-standing-total';
  total.textContent = cell.total.toLocaleString();
  root.appendChild(total);

  const gain = doc.createElement('span');
  gain.className = 'ticker-standing-gain';
  gain.textContent = `(+${cell.gain.toLocaleString()})`;
  root.appendChild(gain);

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
  | { kind: 'standing'; position: number; horseName: string; total: number; gain: number; isLeader: boolean }
  | { kind: 'label'; text: string; groupClass?: string }
  | { kind: 'sep' }        // "•" between achievements
  | { kind: 'groupsep' }   // "│" between order groups (divisions)
  | { kind: 'sectiongap'; wide?: boolean }; // gap between the order and achievement sections (wide for league)

// A contiguous run of the order, optionally labelled. `horses` MUST already be in
// display order (leader first) — callers sort. This is the grouping extension
// point: standard races pass one unlabelled group; League Mode passes one
// labelled group per division.
export type OrderGroup = { label?: { text: string; groupClass?: string }; horses: HorseView[] };

// Same ordering the track and finish ranking use: server rank, then scored
// distance desc, then earlier join. The tie-break keeps previews (where every
// rank is 0) sensible without any server change.
export function sortByRank(horses: HorseView[]): HorseView[] {
  return [...horses].sort((a, b) =>
    (a.rank - b.rank) ||
    (scoredOf(b) - scoredOf(a)) ||
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
    const leaderTokens = group.horses[0] ? scoredOf(group.horses[0]) : 0;
    group.horses.forEach((h, i) => {
      cells.push({
        kind: 'order',
        position: i + 1,
        horseName: h.name,
        valueText: formatOrderValue(i === 0, scoredOf(h), leaderTokens),
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

// Points each racer is on track to earn this fixture, keyed by stable_horse_id.
// Mirrors the server's scoring (score-league-race): bucket by division, rank
// within each by the live order, award the fixed points table by position. Also
// carries scored tokens, matching the server's season-tokens tie-break.
export function projectedGains(race: GetRaceResponse): Map<string, { gain: number; tokens: number }> {
  const bottom = race.league_division_names?.length ?? 1;
  const byDiv = new Map<number, HorseView[]>();
  for (const h of race.horses) {
    const d = h.division ?? bottom;
    const arr = byDiv.get(d) ?? [];
    arr.push(h);
    byDiv.set(d, arr);
  }
  const out = new Map<string, { gain: number; tokens: number }>();
  for (const hs of byDiv.values()) {
    sortByRank(hs).forEach((h, i) => {
      out.set(h.stable_horse_id, { gain: leaguePoints(i + 1), tokens: scoredOf(h) });
    });
  }
  return out;
}

// The live league table projected to this fixture's finish: every season member
// (grouped by division, top flight first) shown with their season points PLUS the
// points their current position would earn, re-ranked within each division by that
// projected total. Racers not yet in the standings (new entrants) are folded in at
// zero points; non-racers keep their standing with a +0. Empty divisions are dropped.
export function leagueStandingsCells(race: GetRaceResponse, standings: SeasonStandings): TickerCell[] {
  const gains = projectedGains(race);
  const bottom = race.league_division_names?.length ?? standings.divisions.length;

  // Racers grouped by division, so a new entrant missing from the standings still
  // shows up in the right table.
  const racersByDiv = new Map<number, HorseView[]>();
  for (const h of race.horses) {
    const d = h.division ?? bottom;
    const arr = racersByDiv.get(d) ?? [];
    arr.push(h);
    racersByDiv.set(d, arr);
  }
  const inStandings = new Set<string>();
  for (const div of standings.divisions) for (const r of div.rows) inStandings.add(r.stable_horse_id);

  const cells: TickerCell[] = [];
  let emittedGroup = false;
  for (const div of standings.divisions) {
    const rows = div.rows.map((r) => ({
      stable_horse_id: r.stable_horse_id, name: r.horse_name, points: r.points, seasonTokens: r.season_tokens,
    }));
    for (const h of racersByDiv.get(div.division) ?? []) {
      if (!inStandings.has(h.stable_horse_id)) {
        rows.push({ stable_horse_id: h.stable_horse_id, name: h.name, points: 0, seasonTokens: 0 });
      }
    }
    if (rows.length === 0) continue;

    const projected = rows.map((r) => {
      const g = gains.get(r.stable_horse_id);
      const gain = g?.gain ?? 0;
      return { name: r.name, gain, total: r.points + gain, projTokens: r.seasonTokens + (g?.tokens ?? 0) };
    });
    // Same tie-break shape as the league table: points (projected) desc, then
    // season tokens (projected) desc, then name for a stable order.
    projected.sort((a, b) =>
      (b.total - a.total) || (b.projTokens - a.projTokens) ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    if (emittedGroup) cells.push({ kind: 'groupsep' });
    emittedGroup = true;
    cells.push({ kind: 'label', text: div.name, groupClass: `ticker-div-${((div.division - 1) % 3) + 1}` });
    projected.forEach((r, i) => {
      cells.push({ kind: 'standing', position: i + 1, horseName: r.name, total: r.total, gain: r.gain, isLeader: i === 0 });
    });
  }
  return cells;
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
    case 'standing': return renderStandingItem(doc, cell);
    case 'label': return renderGroupLabel(doc, cell);
    case 'sep': return renderTickerSep(doc);
    case 'groupsep': return renderGroupSep(doc);
    case 'sectiongap': return renderSectionGap(doc, cell.wide);
  }
}

export type Ticker = {
  el: HTMLElement;
  /**
   * Queue the looping content. A new batch does NOT cut the current pass short:
   * items already on screen keep scrolling and the pass runs to its loop-seam,
   * then the queued batch takes over (bracketed by seams as usual). Only when the
   * ticker is idle (nothing looping) does a batch start immediately. Pass `[]` to
   * let the ticker drain to empty after the current pass (e.g. race not live).
   */
  setCells(cells: TickerCell[]): void;
  destroy(): void;
};

// What appendNext should emit next: a real cell, or the loop-seam that ends a pass.
export type NextEmit = { kind: 'cell'; cell: TickerCell } | { kind: 'seam' };

// The pass cycler, kept DOM-free so it's unit-testable. It walks `cells`
// cyclically, emits one loop-seam after the last cell, and — crucially — only
// swaps in a queued batch at that seam. Swapping mid-pass is exactly the bug
// that made the on-screen order "jump back to the start" on every poll: the old
// code reset the cursor immediately, so the next append restarted from cell 0.
export function createPassScheduler(initial: TickerCell[] = []) {
  let cells: TickerCell[] = initial.slice();
  let pending: TickerCell[] | null = null;
  let cursor = 0;

  return {
    // Queue a batch. Applied immediately only when nothing is currently looping
    // (no pass to finish); otherwise deferred to the next seam. The latest queued
    // batch wins if set() is called several times within one pass.
    set(next: TickerCell[]): void {
      if (cells.length === 0) {
        cells = next.slice();
        pending = null;
        cursor = 0;
      } else {
        pending = next.slice();
      }
    },
    // The batch currently being emitted — the old one until the seam swap lands.
    current(): TickerCell[] {
      return cells;
    },
    next(): NextEmit | null {
      if (cells.length === 0) return null;
      const period = cells.length + 1; // cells + one loop-seam
      const slot = cursor % period;
      cursor++;
      if (slot === cells.length) {
        // End of pass: adopt any queued batch so the next pass shows fresh stats.
        if (pending !== null) {
          cells = pending;
          pending = null;
          cursor = 0;
        }
        return { kind: 'seam' };
      }
      return { kind: 'cell', cell: cells[slot]! };
    },
  };
}

const SPEED_PX_PER_S = 70;
const FILL_BUFFER_PX = 96; // keep this much content past the right edge
const MIN_GAP_PX = 140;        // loop-seam floor for a standard (flat) ticker
const MIN_GAP_PX_LEAGUE = 600; // wider floor for the league order (division groups) so it doesn't tile

// League batches carry division-group labels and need a wider loop-seam so the
// grouped order gets breathing room; standard (flat) tickers keep the base floor.
function seamFloorFor(cells: TickerCell[]): number {
  return cells.some((c) => c.kind === 'label') ? MIN_GAP_PX_LEAGUE : MIN_GAP_PX;
}

export function createTicker(doc: Document): Ticker {
  const el = doc.createElement('div');
  el.className = 'achievement-ticker is-empty';

  const track = doc.createElement('div');
  track.className = 'achievement-ticker-track';
  el.appendChild(track);

  const scheduler = createPassScheduler();
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
    const emit = scheduler.next();
    if (emit === null) return false;

    const isSeam = emit.kind === 'seam';
    const node: HTMLElement = isSeam ? renderTickerGap(doc) : buildCellNode(doc, emit.cell);

    track.appendChild(node);
    let width = Math.max(1, node.offsetWidth);

    if (isSeam) {
      // Stretch the gap so one full pass spans at least the viewport — a short
      // batch fully clears the screen before it repeats, instead of tiling.
      const viewport = el.clientWidth || 0;
      width = Math.max(seamFloor, viewport - widthSinceSeam + seamFloor);
      node.style.width = `${width}px`;
      widthSinceSeam = 0;
      // A seam is the pass boundary where the scheduler may have swapped in a
      // deferred batch — refresh the floor for the pass that now begins.
      seamFloor = seamFloorFor(scheduler.current());
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
      scheduler.set(next);
      // If the scheduler applied the batch immediately (nothing was looping), it
      // is the live batch now, so adopt its seam floor. If it deferred, current()
      // is still the old batch and appendNext refreshes the floor at the seam.
      seamFloor = seamFloorFor(scheduler.current());
    },
    destroy() {
      if (raf !== null) win.cancelAnimationFrame(raf);
      raf = null;
      mounted = [];
      track.replaceChildren();
    },
  };
}
