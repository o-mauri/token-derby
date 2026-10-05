import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SeasonLink } from '../models';
import { SeasonPager } from './season-pager';

type Inputs = { progress?: { round: number; total: number } | null; champion?: { name: string; owner: string; division: string } | null; prev?: SeasonLink | null; next?: SeasonLink | null };

async function render(i: Inputs) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const f = TestBed.createComponent(SeasonPager);
  f.componentRef.setInput('label', 'SEASON 3');
  f.componentRef.setInput('progress', i.progress ?? null);
  f.componentRef.setInput('champion', i.champion ?? null);
  f.componentRef.setInput('prev', i.prev ?? null);
  f.componentRef.setInput('next', i.next ?? null);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}
const text = (el: HTMLElement, sel: string) => el.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim();

describe('SeasonPager', () => {
  it('shows the current season with its progress', async () => {
    const el = await render({ progress: { round: 6, total: 10 } });
    expect(text(el, '.label')).toBe('SEASON 3');
    expect(text(el, '.progress')).toBe('Round 6 of 10 4 to go');
    expect(el.querySelector('.final')).toBeNull();
  });

  it('marks a past season final and names its champion', async () => {
    const el = await render({ champion: { name: 'Gallopz', owner: 'dana', division: 'Premier' } });
    expect(text(el, '.final')).toBe('FINAL');
    expect(text(el, '.champion')).toBe('SEASON 3 CHAMPION · Gallopz (dana) · Premier');
  });

  it('links to the neighbouring seasons by query string, with names for screen readers', async () => {
    const el = await render({ prev: { key: 2, label: 'Season 2' }, next: { key: 4, label: 'Season 4' } });
    const prev = el.querySelector('a.prev')!;
    expect(prev.getAttribute('href')).toBe('/?season=2');
    expect(prev.getAttribute('aria-label')).toBe('Previous season, Season 2');
    expect(el.querySelector('a.next')?.getAttribute('aria-label')).toBe('Next season, Season 4');
  });

  it('fades an end with nothing beyond it', async () => {
    const el = await render({ prev: { key: 2, label: 'Season 2' } });
    const next = el.querySelector('.next')!;
    expect(next.tagName).toBe('SPAN');
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(next.getAttribute('aria-label')).toBe('No later season');
  });
});
