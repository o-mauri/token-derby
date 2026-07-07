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
  buildCellNode,
} from '../src/render/ticker.js';
import type { GetRaceResponse, HorseView } from '@token-derby/shared';

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
