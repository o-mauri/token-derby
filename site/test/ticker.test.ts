import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderTickerItem,
  collectFreshItems,
  formatOrderValue,
  renderOrderItem,
  sortByRank,
  singleGroupOrder,
  composeOrderCells,
  liveOrderCells,
  leagueOrderCells,
  buildCellNode,
  createPassScheduler,
  projectedGains,
  leagueStandingsCells,
  renderStandingItem,
} from '../src/render/ticker.js';
import type { TickerCell } from '../src/render/ticker.js';
import type { GetRaceResponse, HorseView, SeasonStandings, StandingRow } from '@token-derby/shared';

beforeEach(() => {
  document.body.innerHTML = '<div id="container"></div>';
});

function horse(over: Partial<HorseView>): HorseView {
  return {
    horse_id: over.horse_id ?? 'h1',
    stable_horse_id: 'stable',
    name: over.name ?? 'Stormbringer',
    colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
    current_tokens: 0,
    last_heartbeat: new Date(0).toISOString(),
    joined_at: new Date(0).toISOString(),
    rank: 1,
    user_id: 'u1',
    user_name: 'Alice',
    xp: 0,
    recent_events: over.recent_events,
  } as HorseView;
}

function race(horses: HorseView[]): GetRaceResponse {
  return {
    race_id: 'r',
    name: 'Test',
    start_time: new Date(0).toISOString(),
    end_time: new Date(0).toISOString(),
    tz: 'UTC',
    max_participants: 30,
    join_code: 'ABCDEF',
    created_at: new Date(0).toISOString(),
    status: 'live',
    server_time: new Date(0).toISOString(),
    time_left_seconds: 100,
    horses,
  } as GetRaceResponse;
}

describe('renderTickerItem', () => {
  it('builds a one-line node with horse name, achievement, description, and XP', () => {
    const node = renderTickerItem(document, {
      horseName: 'Thundercloud',
      name: 'Overtake!',
      description: 'Overtook another horse',
      xp: 3,
    });
    expect(node.classList.contains('achievement-ticker-item')).toBe(true);
    expect(node.textContent).toContain('Thundercloud');
    expect(node.textContent).toContain('Overtake!');
    expect(node.textContent).toContain('Overtook another horse');
    expect(node.textContent).toContain('+3 XP');
  });
});

describe('collectFreshItems', () => {
  it('returns items for events newer than the watermark and advances it', () => {
    const shownAt = new Map<string, number>();
    const r = race([
      horse({ horse_id: 'h1', name: 'Stormbringer', recent_events: [
        { at: 10, name: 'Took the lead!', xp: 5 },
        { at: 20, name: 'Overtake!', xp: 3 },
      ] }),
    ]);

    const first = collectFreshItems(r, shownAt);
    expect(first.map((i) => i.name)).toEqual(['Took the lead!', 'Overtake!']);
    expect(first[0]!.horseName).toBe('Stormbringer');
    expect(shownAt.get('h1')).toBe(20);

    // Same snapshot again → nothing fresh.
    expect(collectFreshItems(r, shownAt)).toEqual([]);
  });

  it('only surfaces events past the existing watermark on later ticks', () => {
    const shownAt = new Map<string, number>([['h1', 20]]);
    const r = race([
      horse({ horse_id: 'h1', recent_events: [
        { at: 20, name: 'Overtake!', xp: 3 },
        { at: 30, name: 'Stampede!', xp: 2 },
      ] }),
    ]);
    const items = collectFreshItems(r, shownAt);
    expect(items.map((i) => i.name)).toEqual(['Stampede!']);
    expect(shownAt.get('h1')).toBe(30);
  });

  it('describes multi-position overtakes using the climb count', () => {
    const shownAt = new Map<string, number>();
    const r = race([
      horse({ horse_id: 'h1', recent_events: [{ at: 5, name: 'Overtake!', xp: 9 }] }),
    ]);
    const items = collectFreshItems(r, shownAt);
    expect(items[0]!.description).toBe('Overtook 3 horses');
  });

  it('scales token thresholds by the input multiplier when the race counts input', () => {
    const shownAt = new Map<string, number>();
    const r = {
      ...race([horse({ horse_id: 'h1', recent_events: [{ at: 5, name: 'Stampede!', xp: 2 }] })]),
      counts_input: true,
    } as GetRaceResponse;
    const items = collectFreshItems(r, shownAt);
    // 7,000 base × 10 = 70,000 (matches the CLI), not the base 7,000.
    expect(items[0]!.description).toContain('70,000');
  });

  it('uses the base threshold when the race does not count input', () => {
    const shownAt = new Map<string, number>();
    const r = race([horse({ horse_id: 'h1', recent_events: [{ at: 5, name: 'Stampede!', xp: 2 }] })]);
    const items = collectFreshItems(r, shownAt);
    expect(items[0]!.description).toContain('7,000');
  });

  it('returns an empty array when no horse has fresh events', () => {
    const shownAt = new Map<string, number>();
    const r = race([horse({ horse_id: 'h1', recent_events: [] }), horse({ horse_id: 'h2' })]);
    expect(collectFreshItems(r, shownAt)).toEqual([]);
  });
});

describe('formatOrderValue', () => {
  it('shows the leader\'s absolute token count', () => {
    expect(formatOrderValue(true, 1_502_338, 1_502_338)).toBe('1,502,338');
  });

  it('shows everyone else as a minus-signed gap to the leader', () => {
    // U+2212 minus sign, not ASCII hyphen
    expect(formatOrderValue(false, 1_284_905, 1_502_338)).toBe('−217,433');
  });

  it('shows a zero gap when tied with the leader', () => {
    expect(formatOrderValue(false, 500, 500)).toBe('−0');
  });

  it('clamps a rank/token disagreement to zero instead of double-minus', () => {
    expect(formatOrderValue(false, 5000, 1000)).toBe('−0');
  });
});

describe('renderOrderItem', () => {
  it('renders position, name, and value with leader styling on the leader', () => {
    const node = renderOrderItem(document, {
      position: 1,
      horseName: 'Bolt',
      valueText: '1,502,338',
      isLeader: true,
    });
    expect(node.classList.contains('ticker-order')).toBe(true);
    expect(node.textContent).toContain('1.');
    expect(node.textContent).toContain('Bolt');
    expect(node.textContent).toContain('1,502,338');
    expect(node.querySelector('.ticker-order-val--leader')).not.toBeNull();
  });

  it('omits leader styling for non-leaders', () => {
    const node = renderOrderItem(document, {
      position: 2,
      horseName: 'Ada',
      valueText: '−217,433',
      isLeader: false,
    });
    expect(node.querySelector('.ticker-order-val--leader')).toBeNull();
    expect(node.querySelector('.ticker-order-val')).not.toBeNull();
  });
});

describe('sortByRank', () => {
  it('orders by rank, then by tokens desc when ranks tie', () => {
    const a = horse({ horse_id: 'a', name: 'A' }); a.rank = 0; a.current_tokens = 100;
    const b = horse({ horse_id: 'b', name: 'B' }); b.rank = 0; b.current_tokens = 300;
    const c = horse({ horse_id: 'c', name: 'C' }); c.rank = 1; c.current_tokens = 999;
    expect(sortByRank([a, c, b]).map(h => h.name)).toEqual(['B', 'A', 'C']);
  });
});

describe('composeOrderCells', () => {
  it('builds a single ungrouped run with leader tokens then gaps', () => {
    const lead = horse({ horse_id: 'l', name: 'Bolt' }); lead.rank = 1; lead.current_tokens = 1_502_338;
    const two = horse({ horse_id: 't', name: 'Ada' }); two.rank = 2; two.current_tokens = 1_284_905;
    const cells = composeOrderCells(singleGroupOrder([two, lead]));
    expect(cells).toEqual([
      { kind: 'order', position: 1, horseName: 'Bolt', valueText: '1,502,338', isLeader: true },
      { kind: 'order', position: 2, horseName: 'Ada', valueText: '−217,433', isLeader: false },
    ]);
  });

  it('produces exactly one cell with no gap/other cells for a single racer', () => {
    const only = horse({ horse_id: 'o', name: 'Solo' }); only.rank = 1; only.current_tokens = 750;
    const cells = composeOrderCells(singleGroupOrder([only]));
    expect(cells).toEqual([
      { kind: 'order', position: 1, horseName: 'Solo', valueText: '750', isLeader: true },
    ]);
  });

  it('shows a zero-tokens leader as 0 and the trailing horse as −0', () => {
    const lead = horse({ horse_id: 'l', name: 'Bolt' }); lead.rank = 1; lead.current_tokens = 0;
    const two = horse({ horse_id: 't', name: 'Ada' }); two.rank = 2; two.current_tokens = 0;
    const cells = composeOrderCells(singleGroupOrder([two, lead]));
    expect(cells).toEqual([
      { kind: 'order', position: 1, horseName: 'Bolt', valueText: '0', isLeader: true },
      { kind: 'order', position: 2, horseName: 'Ada', valueText: '−0', isLeader: false },
    ]);
  });

  it('separates multiple groups with a groupsep and emits labels', () => {
    const d1 = horse({ horse_id: 'x', name: 'Bolt' }); d1.rank = 1; d1.current_tokens = 900;
    const d2 = horse({ horse_id: 'y', name: 'Oak' }); d2.rank = 1; d2.current_tokens = 400;
    const cells = composeOrderCells([
      { label: { text: 'DIV 1', groupClass: 'd1' }, horses: [d1] },
      { label: { text: 'DIV 2', groupClass: 'd2' }, horses: [d2] },
    ]);
    expect(cells).toEqual([
      { kind: 'label', text: 'DIV 1', groupClass: 'd1' },
      { kind: 'order', position: 1, horseName: 'Bolt', valueText: '900', isLeader: true },
      { kind: 'groupsep' },
      { kind: 'label', text: 'DIV 2', groupClass: 'd2' },
      { kind: 'order', position: 1, horseName: 'Oak', valueText: '400', isLeader: true },
    ]);
  });
});

describe('liveOrderCells', () => {
  it('produces one flat ungrouped run from a race snapshot', () => {
    const lead = horse({ horse_id: 'l', name: 'Bolt' }); lead.rank = 1; lead.current_tokens = 1000;
    const two = horse({ horse_id: 't', name: 'Ada' }); two.rank = 2; two.current_tokens = 600;
    const cells = liveOrderCells(race([two, lead]));
    expect(cells.every(c => c.kind === 'order')).toBe(true);
    expect(cells.map(c => (c as any).horseName)).toEqual(['Bolt', 'Ada']);
  });
});

describe('leagueOrderCells', () => {
  const horse = (over: Partial<HorseView>): HorseView => ({
    horse_id: over.horse_id ?? 'h', stable_horse_id: over.horse_id, name: over.name ?? 'H',
    colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
    current_tokens: over.current_tokens ?? 0, rank: over.rank ?? 1, joined_at: '2026-07-07T00:00:00Z',
    xp: 0, user_name: 'U', division: over.division,
  } as HorseView);
  const base = { league_id: 'o1', league_division_names: ['Premier', 'Championship'] };

  it('groups the order by division with real-name labels, top flight first', () => {
    const race = { ...base, horses: [
      horse({ horse_id: 'a', name: 'Bolt', division: 1, rank: 1, current_tokens: 900 }),
      horse({ horse_id: 'c', name: 'Oak', division: 2, rank: 1, current_tokens: 500 }),
      horse({ horse_id: 'b', name: 'Ada', division: 1, rank: 2, current_tokens: 700 }),
    ] } as any;
    const cells = leagueOrderCells(race);
    const labels = cells.filter((c) => c.kind === 'label').map((c: any) => c.text);
    expect(labels).toEqual(['Premier', 'Championship']);
    // a group separator appears between the two divisions
    expect(cells.some((c) => c.kind === 'groupsep')).toBe(true);
    // within Premier, Bolt (rank 1) precedes Ada (rank 2)
    const orderNames = cells.filter((c) => c.kind === 'order').map((c: any) => c.horseName);
    expect(orderNames.slice(0, 2)).toEqual(['Bolt', 'Ada']);
  });

  it('falls back to a single flat group for a non-league race', () => {
    const race = { horses: [horse({ horse_id: 'a', rank: 1 }), horse({ horse_id: 'b', rank: 2 })] } as any;
    const cells = leagueOrderCells(race);
    expect(cells.some((c) => c.kind === 'label')).toBe(false);
    expect(cells.some((c) => c.kind === 'groupsep')).toBe(false);
  });

  it('skips empty divisions', () => {
    const race = { league_id: 'o1', league_division_names: ['Premier', 'Championship', 'League One'],
      horses: [horse({ horse_id: 'a', division: 1, rank: 1 })] } as any;
    expect(leagueOrderCells(race).filter((c) => c.kind === 'label').map((c: any) => c.text)).toEqual(['Premier']);
  });
});

describe('league standings ticker', () => {
  const lh = (over: Partial<HorseView>): HorseView => ({
    horse_id: over.horse_id ?? 'h', stable_horse_id: over.stable_horse_id ?? over.horse_id ?? 'h',
    name: over.name ?? 'H', colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
    current_tokens: over.current_tokens ?? 0, rank: over.rank ?? 1, joined_at: '2026-07-07T00:00:00Z',
    xp: 0, user_name: 'U', division: over.division,
  } as HorseView);

  const leagueRace = (horses: HorseView[]): GetRaceResponse => ({
    race_id: 'r', name: 'Fixture', status: 'live', horses,
    league_id: 'org1', league_season: 2, league_round: 3,
    league_division_names: ['Premier', 'Championship'],
  } as GetRaceResponse);

  const srow = (id: string, name: string, points: number, tokens: number): StandingRow =>
    ({ rank: 0, stable_horse_id: id, horse_name: name, user_name: 'U', points, season_tokens: tokens, zone: null });

  const standingsOf = (divisions: SeasonStandings['divisions']): SeasonStandings =>
    ({ org_name: 'Org', season: 2, round: 3, races_per_season: 8, divisions });

  describe('projectedGains', () => {
    it('awards fixed-table points by live position within each division', () => {
      const g = projectedGains(leagueRace([
        lh({ horse_id: 'a', division: 1, rank: 1, current_tokens: 900 }),
        lh({ horse_id: 'b', division: 1, rank: 2, current_tokens: 700 }),
        lh({ horse_id: 'c', division: 2, rank: 1, current_tokens: 500 }),
      ]));
      expect(g.get('a')).toEqual({ gain: 20, tokens: 900 }); // 1st in Premier
      expect(g.get('b')).toEqual({ gain: 15, tokens: 700 }); // 2nd in Premier
      expect(g.get('c')).toEqual({ gain: 20, tokens: 500 }); // 1st in Championship
    });

    it('scores nothing below the points table (10th and lower)', () => {
      const horses = Array.from({ length: 11 }, (_, i) =>
        lh({ horse_id: `h${i}`, division: 1, rank: i + 1, current_tokens: 1000 - i }));
      const g = projectedGains(leagueRace(horses));
      expect(g.get('h8')!.gain).toBe(1); // 9th → 1 point
      expect(g.get('h9')!.gain).toBe(0); // 10th → 0
      expect(g.get('h10')!.gain).toBe(0);
    });
  });

  describe('leagueStandingsCells', () => {
    it('re-ranks each division by projected total, with a +gain bracket', () => {
      const race = leagueRace([
        lh({ horse_id: 'a', name: 'Bolt', division: 1, rank: 1, current_tokens: 900 }),
        lh({ horse_id: 'b', name: 'Ada', division: 1, rank: 2, current_tokens: 700 }),
        lh({ horse_id: 'c', name: 'Oak', division: 2, rank: 1, current_tokens: 500 }),
      ]);
      const standings = standingsOf([
        { division: 1, name: 'Premier', rows: [
          srow('d', 'Fern', 20, 9000),   // not racing today
          srow('a', 'Bolt', 10, 5000),
          srow('b', 'Ada', 8, 4000),
        ] },
        { division: 2, name: 'Championship', rows: [srow('c', 'Oak', 3, 1000)] },
      ]);
      expect(leagueStandingsCells(race, standings)).toEqual([
        { kind: 'label', text: 'Premier', groupClass: 'ticker-div-1' },
        { kind: 'standing', position: 1, horseName: 'Bolt', total: 30, gain: 20, isLeader: true },
        { kind: 'standing', position: 2, horseName: 'Ada', total: 23, gain: 15, isLeader: false },
        { kind: 'standing', position: 3, horseName: 'Fern', total: 20, gain: 0, isLeader: false },
        { kind: 'groupsep' },
        { kind: 'label', text: 'Championship', groupClass: 'ticker-div-2' },
        { kind: 'standing', position: 1, horseName: 'Oak', total: 23, gain: 20, isLeader: true },
      ]);
    });

    it('adds a synthetic zero-point row for a racer not yet in the standings', () => {
      const race = leagueRace([
        lh({ horse_id: 'c', name: 'Oak', division: 2, rank: 1, current_tokens: 500 }),
        lh({ horse_id: 'e', name: 'Newbie', division: 2, rank: 2, current_tokens: 400 }),
      ]);
      const standings = standingsOf([
        { division: 1, name: 'Premier', rows: [] },
        { division: 2, name: 'Championship', rows: [srow('c', 'Oak', 3, 1000)] },
      ]);
      // Premier is empty → skipped; Newbie appears at 0 + projected gain.
      expect(leagueStandingsCells(race, standings)).toEqual([
        { kind: 'label', text: 'Championship', groupClass: 'ticker-div-2' },
        { kind: 'standing', position: 1, horseName: 'Oak', total: 23, gain: 20, isLeader: true },
        { kind: 'standing', position: 2, horseName: 'Newbie', total: 15, gain: 15, isLeader: false },
      ]);
    });

    it('skips divisions with no members', () => {
      const race = leagueRace([lh({ horse_id: 'a', name: 'Bolt', division: 1, rank: 1 })]);
      const standings = standingsOf([
        { division: 1, name: 'Premier', rows: [srow('a', 'Bolt', 5, 100)] },
        { division: 2, name: 'Championship', rows: [] },
      ]);
      const cells = leagueStandingsCells(race, standings);
      expect(cells.some((c) => c.kind === 'label' && c.text === 'Championship')).toBe(false);
      expect(cells.some((c) => c.kind === 'groupsep')).toBe(false);
    });
  });

  describe('renderStandingItem', () => {
    it('renders position, name, projected total, and +gain, with leader styling on the top row', () => {
      const node = renderStandingItem(document,
        { position: 1, horseName: 'Bolt', total: 30, gain: 20, isLeader: true });
      expect(node.classList.contains('ticker-standing')).toBe(true);
      expect(node.textContent).toContain('1.');
      expect(node.textContent).toContain('Bolt');
      expect(node.textContent).toContain('30');
      expect(node.textContent).toContain('(+20)');
      expect(node.querySelector('.ticker-standing-total--leader')).not.toBeNull();
    });

    it('shows a zero gain as (+0) and omits leader styling off the top row', () => {
      const node = renderStandingItem(document,
        { position: 3, horseName: 'Fern', total: 20, gain: 0, isLeader: false });
      expect(node.textContent).toContain('(+0)');
      expect(node.querySelector('.ticker-standing-total--leader')).toBeNull();
    });
  });

  describe('buildCellNode (standing)', () => {
    it('renders a standing cell', () => {
      const node = buildCellNode(document,
        { kind: 'standing', position: 1, horseName: 'Bolt', total: 30, gain: 20, isLeader: true });
      expect(node.classList.contains('ticker-standing')).toBe(true);
    });
  });
});

describe('buildCellNode', () => {
  it('renders an order cell', () => {
    const node = buildCellNode(document, { kind: 'order', position: 1, horseName: 'Bolt', valueText: '900', isLeader: true });
    expect(node.classList.contains('ticker-order')).toBe(true);
  });

  it('renders an achievement cell', () => {
    const node = buildCellNode(document, { kind: 'achievement', item: { horseName: 'Ada', name: 'Overtake!', description: 'passed', xp: 3 } });
    expect(node.classList.contains('achievement-ticker-item')).toBe(true);
  });

  it('renders a group label with its group class', () => {
    const node = buildCellNode(document, { kind: 'label', text: 'DIV 1', groupClass: 'd1' });
    expect(node.classList.contains('ticker-group-label')).toBe(true);
    expect(node.classList.contains('d1')).toBe(true);
    expect(node.textContent).toBe('DIV 1');
  });

  it('renders a group separator', () => {
    expect(buildCellNode(document, { kind: 'groupsep' }).classList.contains('ticker-group-sep')).toBe(true);
  });

  it('renders a section gap', () => {
    expect(buildCellNode(document, { kind: 'sectiongap' }).classList.contains('ticker-section-gap')).toBe(true);
  });

  it('renders an achievement separator', () => {
    expect(buildCellNode(document, { kind: 'sep' }).classList.contains('achievement-ticker-sep')).toBe(true);
  });
});

describe('createPassScheduler', () => {
  const A: TickerCell = { kind: 'order', position: 1, horseName: 'A', valueText: '1', isLeader: true };
  const B: TickerCell = { kind: 'order', position: 2, horseName: 'B', valueText: '−1', isLeader: false };
  const C: TickerCell = { kind: 'order', position: 1, horseName: 'C', valueText: '2', isLeader: true };
  const D: TickerCell = { kind: 'order', position: 2, horseName: 'D', valueText: '−2', isLeader: false };

  // Drain one full pass: every cell in order, then a single seam.
  function drainPass(s: ReturnType<typeof createPassScheduler>, expected: TickerCell[]) {
    for (const cell of expected) {
      expect(s.next()).toEqual({ kind: 'cell', cell });
    }
    expect(s.next()).toEqual({ kind: 'seam' });
  }

  it('returns null while empty', () => {
    const s = createPassScheduler();
    expect(s.next()).toBeNull();
  });

  it('applies the first batch immediately (nothing is looping yet)', () => {
    const s = createPassScheduler();
    s.set([A, B]);
    drainPass(s, [A, B]);
    // and it repeats
    expect(s.next()).toEqual({ kind: 'cell', cell: A });
  });

  it('defers a new batch until the current pass reaches its seam', () => {
    const s = createPassScheduler();
    s.set([A, B]);
    // Part-way through the A/B pass, new stats arrive.
    expect(s.next()).toEqual({ kind: 'cell', cell: A });
    s.set([C, D]);
    // The current pass finishes with its remaining cell + the seam — no reset.
    expect(s.next()).toEqual({ kind: 'cell', cell: B });
    expect(s.next()).toEqual({ kind: 'seam' });
    // Only now does the new batch begin, bracketed by seams as usual.
    drainPass(s, [C, D]);
  });

  it('keeps only the latest deferred batch when set repeatedly mid-pass', () => {
    const s = createPassScheduler();
    s.set([A, B]);
    expect(s.next()).toEqual({ kind: 'cell', cell: A });
    s.set([C, D]);
    s.set([A]); // supersedes [C, D]
    expect(s.next()).toEqual({ kind: 'cell', cell: B });
    expect(s.next()).toEqual({ kind: 'seam' });
    drainPass(s, [A]);
  });

  it('drains to empty at the seam when set([]) arrives mid-pass', () => {
    const s = createPassScheduler();
    s.set([A, B]);
    expect(s.next()).toEqual({ kind: 'cell', cell: A });
    s.set([]);
    expect(s.next()).toEqual({ kind: 'cell', cell: B });
    expect(s.next()).toEqual({ kind: 'seam' });
    expect(s.next()).toBeNull();
    // A later non-empty batch applies immediately again (nothing is looping).
    s.set([C]);
    expect(s.next()).toEqual({ kind: 'cell', cell: C });
  });

  it('current() reflects the live batch (old until the seam, then the new one)', () => {
    const s = createPassScheduler();
    s.set([A, B]);
    s.next();
    s.set([C, D]);
    expect(s.current()).toEqual([A, B]); // still the pass on screen
    s.next(); // B
    s.next(); // seam → swap
    expect(s.current()).toEqual([C, D]);
  });
});

describe('section gap (league spacing)', () => {
  it('renders a wide section gap only when flagged (league order)', () => {
    const flat = buildCellNode(document, { kind: 'sectiongap' });
    expect(flat.className).toBe('ticker-section-gap');
    const wide = buildCellNode(document, { kind: 'sectiongap', wide: true });
    expect(wide.classList.contains('ticker-section-gap--wide')).toBe(true);
  });
});
