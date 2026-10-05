import { TestBed } from '@angular/core/testing';
import { runner } from '../fixture';
import type { LeagueDivisionView } from '../models';
import { LeagueTable } from './league-table';

const DIV: LeagueDivisionView = {
  name: 'Premier',
  rows: ['Gallopz', 'Neigh Sayer', 'Hay Girl', 'Seabiscuit'].map((n, i) => ({
    ...runner(n, `o${i}`, 'brown', 0), place: i + 1, points: 44 - i * 4, zone: i === 3 ? 'relegate' as const : null,
  })),
};

async function render(division: LeagueDivisionView) {
  const f = TestBed.createComponent(LeagueTable);
  f.componentRef.setInput('division', division);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('LeagueTable', () => {
  it('heads the column with the division and its size', async () => {
    const el = await render(DIV);
    expect(el.querySelector('.name-head')?.textContent?.trim()).toBe('Premier');
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('4 horses');
  });

  it('lists the horses in order with heads, points and medals for the top three', async () => {
    const el = await render(DIV);
    const rows = [...el.querySelectorAll('.row')];
    expect(rows.map((r) => r.querySelector('.name')?.textContent?.trim())).toEqual(['Gallopz', 'Neigh Sayer', 'Hay Girl', 'Seabiscuit']);
    expect(rows.every((r) => r.querySelector('td-horse-head'))).toBe(true);
    expect(rows[0]!.querySelector('.points')?.textContent?.trim()).toBe('44');
    expect(rows.map((r) => r.querySelector('.place')!.className.replace('place', '').trim())).toEqual(['gold', 'silver', 'bronze', '']);
  });

  it('edges the promotion and relegation places', async () => {
    const el = await render(DIV);
    expect(el.querySelectorAll('.row.relegate')).toHaveLength(1);
  });

  it('says so when a division has no horses', async () => {
    const el = await render({ name: 'League Two', rows: [] });
    expect(el.querySelector('.empty')?.textContent?.trim()).toBe('No horses yet');
    expect(el.querySelector('.count')?.textContent?.trim()).toBe('0 horses');
  });
});
