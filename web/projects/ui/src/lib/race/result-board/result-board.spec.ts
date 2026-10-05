import { TestBed } from '@angular/core/testing';
import { ResultBoard, boardPages } from './result-board';
import { finish } from '../podium/podium.spec';

describe('boardPages', () => {
  it('splits the field below the podium into pages of a given size, labelled by place', () => {
    const rows = Array.from({ length: 15 }, (_, i) => finish(i + 4, `H${i + 4}`, 100));
    const pages = boardPages(rows, 8);
    expect(pages.map((p) => p.label)).toEqual(['Board 4–11', 'Board 12–18']);
    expect(pages.map((p) => p.rows.length)).toEqual([8, 7]);
  });

  it('calls a single page just "Board", and returns none for an empty field', () => {
    expect(boardPages([finish(4, 'A', 1), finish(5, 'B', 1)], 8).map((p) => p.label)).toEqual(['Board']);
    expect(boardPages([], 8)).toEqual([]);
  });
});

describe('ResultBoard', () => {
  it('shows a row per horse: place, sprite, name, owner, tokens, gap and a compact XP bar', async () => {
    const f = TestBed.createComponent(ResultBoard);
    f.componentRef.setInput('rows', [finish(4, 'Thunderbolt', 2880, { hat: { id: 'beanie' } }), finish(5, 'Embers', 1240)]);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    const rows = [...el.querySelectorAll('.row:not(.head)')];
    expect(rows.length).toBe(2);
    expect(rows[0]!.querySelector('.pos')?.textContent).toBe('4');
    expect(rows[0]!.querySelector('.name')?.textContent).toBe('Thunderbolt');
    expect(rows[0]!.querySelector('.owner')?.textContent).toBe("Thunderbolt's owner");
    expect(rows[0]!.querySelector('.tokens')?.textContent).toBe('2,880');
    expect(rows[0]!.querySelector('.behind')?.textContent).toBe('−1,400');
    expect(rows[0]!.querySelector('td-horse .horse-hat-beanie')).not.toBeNull();
    expect(rows[0]!.querySelector('td-xp-bar')!.classList.contains('sm')).toBe(true);
    expect(el.querySelector('.row.head')?.textContent).toContain('Behind');
  });
});
