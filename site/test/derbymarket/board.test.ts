import { describe, it, expect } from 'vitest';
import { buildSections, renderBoard, type Priced, type BoardData, type OpenRow } from '../../src/derbymarket/render/board.js';

const colors = { body: '#c00', mane: '#000', tail: '#000', saddle: '#333' };

function horse(id: string, opts: {
  division?: number; win?: number; podium?: number;
  divisionPrice?: number | null; divisionPodiumPrice?: number | null;
} = {}): Priced {
  return {
    horse_id: id, name: id, colors, division: opts.division,
    win: opts.win ?? 0.1, podium: opts.podium ?? 0.3,
    divisionPrice: opts.divisionPrice ?? null, divisionPodiumPrice: opts.divisionPodiumPrice ?? null,
  };
}

function rowNames(priced: Priced[], names: string[]): string[] {
  return buildSections(priced, names).flatMap((s) => s.rows.map((r) => r.name));
}

describe('buildSections', () => {
  it('produces the eight fixed-order rows for a three-division race', () => {
    const divisionOf4 = (div: number, names: string[]) =>
      names.map((n) => horse(n, { division: div, divisionPrice: 0.25, divisionPodiumPrice: 0.9 }));
    const priced = [
      ...divisionOf4(1, ['a1', 'a2', 'a3', 'a4']),
      ...divisionOf4(2, ['b1', 'b2', 'b3', 'b4']),
      ...divisionOf4(3, ['c1', 'c2', 'c3', 'c4']),
    ];
    expect(rowNames(priced, ['Alpha', 'Beta', 'Gamma'])).toEqual([
      'To Win', 'To Podium',
      'Win Alpha', 'Podium Alpha',
      'Win Beta', 'Podium Beta',
      'Win Gamma', 'Podium Gamma',
    ]);
  });

  it('suppresses every row for a division of 1 runner', () => {
    const priced = [horse('a', { division: 1, divisionPrice: 1, divisionPodiumPrice: 1 })];
    const sections = buildSections(priced, ['Solo']);
    expect(sections.map((s) => s.heading)).toEqual(['The race']);
  });

  it('keeps the win row but drops the podium row for a division of 3', () => {
    const priced = ['a', 'b', 'c'].map((id) =>
      horse(id, { division: 1, divisionPrice: 0.33, divisionPodiumPrice: 1 }));
    expect(rowNames(priced, ['Trio'])).toEqual(['To Win', 'To Podium', 'Win Trio']);
  });

  it('suppresses the podium row when divisionPodium is missing (pre-field snapshot)', () => {
    const priced = ['a', 'b', 'c', 'd'].map((id) =>
      horse(id, { division: 1, divisionPrice: 0.25, divisionPodiumPrice: null }));
    expect(rowNames(priced, ['Quartet'])).toEqual(['To Win', 'To Podium', 'Win Quartet']);
  });

  it('does not reorder rows when a division is priced near-certain', () => {
    // Division 2 is a near-lock (every price close to 1) and division 1 is
    // wide open — row order must stay fixed by division number, not by how
    // "settled" a market looks.
    const priced = [
      ...['a1', 'a2', 'a3', 'a4'].map((id) => horse(id, { division: 1, divisionPrice: 0.25, divisionPodiumPrice: 0.5 })),
      ...['b1', 'b2', 'b3', 'b4'].map((id) => horse(id, { division: 2, divisionPrice: 0.98, divisionPodiumPrice: 0.99 })),
    ];
    expect(rowNames(priced, ['Open', 'Locked'])).toEqual([
      'To Win', 'To Podium', 'Win Open', 'Podium Open', 'Win Locked', 'Podium Locked',
    ]);
  });
});

describe('renderBoard row activation', () => {
  const data: BoardData = {
    raceName: 'Test Race', runnerCount: 2, timeLeftSeconds: 600, finished: false,
    horses: [
      { horse_id: 'h1', name: 'Alpha', colors },
      { horse_id: 'h2', name: 'Beta', colors },
    ],
    prices: [
      { horse_id: 'h1', joined: true, win: 0.6, podium: 0.8, division: null, divisionPodium: null },
      { horse_id: 'h2', joined: true, win: 0.4, podium: 0.5, division: null, divisionPodium: null },
    ],
    showNotJoined: false,
  };

  it('is a real button, reachable by keyboard, that reports its own row and market on click', () => {
    const root = document.createElement('div');
    let opened: OpenRow | null = null;
    const dispose = renderBoard(root, data, (row) => { opened = row; });

    const rows = root.querySelectorAll<HTMLButtonElement>('.dm-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.tagName).toBe('BUTTON');
    expect(rows[0]!.type).toBe('button'); // native Enter/Space activation, no custom key handling needed

    rows[1]!.click(); // second row is "To Podium"
    expect(opened).not.toBeNull();
    expect(opened!.name).toBe('To Podium');
    expect(opened!.market).toBe('podium');
    expect(opened!.heading).toBe('The race');
    expect(opened!.runners.map((r) => r.horse.horse_id)).toEqual(['h1', 'h2']); // sorted by podium price

    dispose();
  });
});

describe('not-joined runners', () => {
  const joinedA = { horse_id: 'a', name: 'Alpha', colors: { body: '#111', mane: '#000', tail: '#000', saddle: '#000' } };
  const joinedB = { horse_id: 'b', name: 'Bravo', colors: { body: '#222', mane: '#000', tail: '#000', saddle: '#000' } };
  const late = { horse_id: 'nj-1', name: 'Late Arrival', joined: false, colors: { body: '#333', mane: '#000', tail: '#000', saddle: '#000' } };
  const prices = [
    { horse_id: 'a', joined: true, win: 0.5, podium: 1, division: null, divisionPodium: null },
    { horse_id: 'b', joined: true, win: 0.3, podium: 1, division: null, divisionPodium: null },
    { horse_id: 'nj-1', joined: false, win: 0.2, podium: 0.9, division: null, divisionPodium: null },
  ];
  const data = (showNotJoined: boolean, onToggleNotJoined?: (s: boolean) => void) => ({
    raceName: 'R', runnerCount: 2, timeLeftSeconds: 600, finished: false,
    horses: [joinedA, joinedB, late], prices, showNotJoined, onToggleNotJoined,
  });

  it('hands the chart every runner, not-joined included, even with the toggle off', () => {
    const root = document.createElement('div');
    const opened: OpenRow[] = [];
    renderBoard(root, data(false), (row) => opened.push(row));
    root.querySelector<HTMLButtonElement>('.dm-row')!.click();
    expect(opened[0]!.runners.map((r) => r.horse.horse_id)).toContain('nj-1');
  });

  it('hides not-joined chips by default', () => {
    const root = document.createElement('div');
    renderBoard(root, data(false));
    expect(root.textContent).not.toContain('Late Arrival');
  });

  it('shows them muted and labelled when toggled on', () => {
    const root = document.createElement('div');
    renderBoard(root, data(true));
    const chip = Array.from(root.querySelectorAll('.dm-chip')).find((c) => c.textContent!.includes('Late Arrival'))!;
    expect(chip.classList.contains('dm-chip--not-joined')).toBe(true);
    expect(chip.textContent).toContain('not joined');
  });

  it('renders the toggle only when there are not-joined runners', () => {
    const root = document.createElement('div');
    renderBoard(root, { ...data(false), horses: [joinedA, joinedB], prices: prices.slice(0, 2) });
    expect(root.querySelector('.dm-toggle-not-joined')).toBeNull();
    renderBoard(root, data(false));
    expect(root.querySelector('.dm-toggle-not-joined')).not.toBeNull();
  });

  it('reports the new state when the toggle is clicked', () => {
    const root = document.createElement('div');
    const seen: boolean[] = [];
    renderBoard(root, data(false, (s) => seen.push(s)));
    root.querySelector<HTMLButtonElement>('.dm-toggle-not-joined')!.click();
    expect(seen).toEqual([true]);
  });

  it('counts only joined runners for market thresholds and meta', () => {
    const sections = buildSections(
      [{ ...joinedA, division: 1, win: .5, podium: 1, divisionPrice: .6, divisionPodiumPrice: 1 },
       { ...late, division: 1, win: .2, podium: .9, divisionPrice: .4, divisionPodiumPrice: 1 }],
      ['Premier'], true,
    );
    // One joined runner in the division: no division win market even with a not-joined rival shown.
    expect(sections.find((s) => s.heading.startsWith('Premier'))).toBeUndefined();
    expect(sections[0]!.rows[0]!.meta).toBe('1 runners');
  });
});

describe('brand and next race', () => {
  const minimal = (extra: Partial<BoardData>): BoardData => ({
    raceName: 'League Race 9/10', runnerCount: 0, timeLeftSeconds: null, finished: true,
    horses: [], prices: [], showNotJoined: false, ...extra,
  });

  it('shows the org name beside the brand', () => {
    const root = document.createElement('div');
    renderBoard(root, minimal({ orgName: 'StackOne' }));
    expect(root.querySelector('.dm-brand')!.textContent).toContain('StackOne');
  });

  it('shows the next race and a countdown on a finished board', () => {
    const root = document.createElement('div');
    const startsAt = new Date(Date.now() + (13 * 60 + 42) * 60_000).toISOString();
    renderBoard(root, minimal({ nextRace: { name: 'League Race 10/10', startsAt } }));
    const banner = root.querySelector('.dm-next')!;
    expect(banner.textContent).toContain('League Race 10/10');
    expect(banner.querySelector('.dm-next-count')!.textContent).toMatch(/^13:4[12]:\d\d$/);
  });

  it('says when nothing is scheduled', () => {
    const root = document.createElement('div');
    renderBoard(root, minimal({ nextRace: null }));
    expect(root.querySelector('.dm-next')!.textContent).toContain('No race scheduled');
  });

  it('shows no banner on a live board', () => {
    const root = document.createElement('div');
    renderBoard(root, minimal({ finished: false, timeLeftSeconds: 600, nextRace: null }));
    expect(root.querySelector('.dm-next')).toBeNull();
  });
});
