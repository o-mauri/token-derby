import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { MonthLink } from '../models';
import { MonthPager } from './month-pager';

async function render(prev: MonthLink | null, next: MonthLink | null) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const f = TestBed.createComponent(MonthPager);
  f.componentRef.setInput('label', 'SEPTEMBER 2026');
  f.componentRef.setInput('count', 9);
  f.componentRef.setInput('prev', prev);
  f.componentRef.setInput('next', next);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('MonthPager', () => {
  it('names the month and its race count', async () => {
    const el = await render(null, null);
    expect(el.querySelector('.month')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('SEPTEMBER 2026 · 9 races');
  });

  it('links to the neighbouring months by query string', async () => {
    const el = await render({ key: '2026-08', label: 'August' }, { key: '2026-10', label: 'October' });
    expect(el.querySelector('a.prev')?.getAttribute('href')).toBe('/?month=2026-08');
    expect(el.querySelector('a.prev')?.textContent?.trim()).toBe('‹ August');
    expect(el.querySelector('a.next')?.textContent?.trim()).toBe('October ›');
    expect(el.querySelector('a.next')?.getAttribute('href')).toBe('/?month=2026-10');
  });

  it('fades an end with no month beyond it, and it is not a link', async () => {
    const el = await render({ key: '2026-08', label: 'August' }, null);
    const next = el.querySelector('.next')!;
    expect(next.tagName).toBe('SPAN');
    expect(next.getAttribute('aria-disabled')).toBe('true');
  });
});
