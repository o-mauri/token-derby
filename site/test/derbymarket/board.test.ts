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
      { horse_id: 'h1', win: 0.6, podium: 0.8, division: null, divisionPodium: null },
      { horse_id: 'h2', win: 0.4, podium: 0.5, division: null, divisionPodium: null },
    ],
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
