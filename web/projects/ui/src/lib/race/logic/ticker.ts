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
        description: describeAchievement(ev),
        xp: ev.xp,
      });
    }
  }
  return items;
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

export const SPEED_PX_PER_S = 70;
export const FILL_BUFFER_PX = 96; // keep this much content past the right edge
export const MIN_GAP_PX = 140;        // loop-seam floor for a standard (flat) ticker
export const MIN_GAP_PX_LEAGUE = 600; // wider floor for the league order (division groups) so it doesn't tile

// League batches carry division-group labels and need a wider loop-seam so the
// grouped order gets breathing room; standard (flat) tickers keep the base floor.
export function seamFloorFor(cells: TickerCell[]): number {
  return cells.some((c) => c.kind === 'label') ? MIN_GAP_PX_LEAGUE : MIN_GAP_PX;
}

