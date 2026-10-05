import { TestBed } from '@angular/core/testing';
import { STATS_VIEW } from '../fixture';
import type { StatsPanelView } from '../models';
import { StatsPanel } from './stats-panel';

async function render(view: StatsPanelView) {
  const f = TestBed.createComponent(StatsPanel);
  f.componentRef.setInput('view', view);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}
const text = (el: HTMLElement, sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim();

describe('StatsPanel', () => {
  it('shows races run, most wins and total tokens', async () => {
    const el = await render(STATS_VIEW);
    expect(text(el, '.races-run .v')).toBe('47');
    expect(text(el, '.most-wins .v')).toBe('Gallopz ×9');
    expect(el.querySelector('.most-wins td-horse')).not.toBeNull();
    expect(text(el, '.total .v')).toBe('1.93B');
  });

  it('draws ten bars scaled to the biggest, the latest marked', async () => {
    const el = await render(STATS_VIEW);
    const bars = [...el.querySelectorAll<HTMLElement>('.bars .bar')];
    expect(bars).toHaveLength(10);
    expect(bars[6]!.style.height).toBe('100%');
    expect(bars.at(-1)!.classList.contains('latest')).toBe(true);
  });

  it('shows "—" and empty bars before the API reports totals', async () => {
    const el = await render({ ...STATS_VIEW, totalTokens: null, lastTen: [null, null] });
    expect(text(el, '.total .v')).toBe('—');
    expect([...el.querySelectorAll<HTMLElement>('.bars .bar')].every((b) => b.style.height === '0%')).toBe(true);
  });

  it('copes with no finished races', async () => {
    const el = await render({ racesRun: 0, mostWins: null, totalTokens: 0, lastTen: [] });
    expect(text(el, '.races-run .v')).toBe('0');
    expect(text(el, '.most-wins .v')).toBe('—');
    expect(el.querySelectorAll('.bars .bar')).toHaveLength(0);
  });
});
