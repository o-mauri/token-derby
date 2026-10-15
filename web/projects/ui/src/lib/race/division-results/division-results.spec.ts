import { TestBed } from '@angular/core/testing';
import { divisionResults, type DivisionRunner } from '../logic/league';
import { DivisionResults } from './division-results';

const C = { body: '#111111', mane: '#222222', tail: '#222222', saddle: '#333333' };
const r = (name: string, division: number, tokens: number): DivisionRunner =>
  ({ id: name, stableId: `s-${name}`, name, owner: `o-${name}`, colors: C, hat: null, tokens, joinedAt: 0, division });

async function render(runners: DivisionRunner[], names: string[]) {
  const f = TestBed.createComponent(DivisionResults);
  f.componentRef.setInput('results', divisionResults(runners, names));
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('DivisionResults', () => {
  it('renders a column per division with its runners in order', async () => {
    const el = await render([r('Comet', 1, 900), r('Bolt', 1, 800), r('Oak', 2, 700)], ['Premier', 'Championship']);
    const cols = [...el.querySelectorAll('.division')];
    expect(cols.map((c) => c.querySelector('.title')!.textContent!.trim())).toEqual(['Premier', 'Championship']);
    expect(cols[0]!.querySelector('.count')!.textContent!.trim()).toBe('2 runners');
    expect([...cols[0]!.querySelectorAll('.name')].map((n) => n.textContent)).toEqual(['Comet', 'Bolt']);
  });

  it('shows the place, tokens and league points, with medal colours for the top three', async () => {
    const el = await render([r('Comet', 1, 4820), r('Bolt', 1, 4310), r('Dash', 1, 3120), r('Ada', 1, 1980)], ['Premier']);
    const rows = [...el.querySelectorAll('.row:not(.head)')];
    expect(rows[0]!.querySelector('.tokens')!.textContent).toBe('4,820');
    expect(rows.map((x) => x.querySelector('.pts')!.textContent!.trim())).toEqual(['+20 pts', '+15 pts', '+12 pts', '+10 pts']);
    expect(rows.map((x) => x.querySelector('.place')!.className)).toEqual(['place gold', 'place silver', 'place bronze', 'place']);
  });

  it('pages more than three divisions through a column window', async () => {
    const el = await render([1, 2, 3, 4].map((d) => r(`H${d}`, d, 100)), ['A', 'B', 'C', 'D']);
    expect(el.querySelector('td-column-window .next')).not.toBeNull();
  });
});
