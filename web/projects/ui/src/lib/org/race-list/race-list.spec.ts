import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RACES_VIEW, runner } from '../fixture';
import type { LiveRow, ResultRow, UpcomingRow } from '../models';
import { RaceList } from './race-list';

const AT = { atMs: Date.now(), timeLeftSeconds: 3600 };
const LIVE: LiveRow = { code: 'K7QX', name: 'Friday Sprint', leader: runner('Gallopz', 'dana', 'brown', 4_210_000), tokens: 4_210_000, runners: 12, anchor: AT };
const UP: UpcomingRow[] = [{ code: 'P2LM', name: 'Friday Sprint', startsAt: '2026-10-03T09:00:00Z', date: 'Fri 3 Oct', time: '09:00', startsIn: 'in 1d 14h', anchor: AT }];

async function render(live: LiveRow | null, upcoming: UpcomingRow[], results: readonly ResultRow[]) {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const f = TestBed.createComponent(RaceList);
  f.componentRef.setInput('live', live);
  f.componentRef.setInput('upcoming', upcoming);
  f.componentRef.setInput('results', results);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}

describe('RaceList', () => {
  it('makes every race a link to its race page', async () => {
    const el = await render(LIVE, UP, RACES_VIEW.latest);
    const hrefs = [...el.querySelectorAll('a.row')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/race/K7QX', '/race/P2LM', '/race/X1AB', '/race/Z9CD', '/race/H3EF']);
    expect(el.querySelectorAll('a.row .go')).toHaveLength(5);
  });

  it('pins the live race in its own row with a countdown', async () => {
    const el = await render(LIVE, [], []);
    const row = el.querySelector('a.row.live')!;
    expect(row.querySelector('td-status-chip')).not.toBeNull();
    expect(row.querySelector('td-countdown')).not.toBeNull();
  });

  it('shows each winner as a head in a disc, with compact figures', async () => {
    const el = await render(null, [], RACES_VIEW.latest);
    const first = el.querySelector('a.row')!;
    expect(first.querySelector('td-horse-head')).not.toBeNull();
    expect(first.querySelector('.tokens')?.textContent?.trim()).toBe('12.1M');
    expect(first.querySelector('.total')?.textContent?.trim()).toBe('61.2M');
    expect(first.querySelector('.ran')?.textContent?.trim()).toBe('11');
  });

  it('shows "—" for a missing winner or figures the API has not reported', async () => {
    const el = await render(null, [], [{ ...RACES_VIEW.latest[0]!, winner: null, tokens: null, runners: null, total: null }]);
    const row = el.querySelector('a.row')!;
    expect(row.querySelector('.winner')?.textContent?.trim()).toBe('—');
    expect(['.tokens', '.ran', '.total'].map((s) => row.querySelector(s)?.textContent?.trim())).toEqual(['—', '—', '—']);
  });

  it('says how soon each upcoming race starts', async () => {
    const el = await render(null, UP, []);
    expect(el.querySelector('a.row .soon')?.textContent?.trim()).toBe('in 1d 14h');
  });

  it('labels the upcoming group with its count and leaves it out when empty', async () => {
    expect((await render(null, UP, [])).querySelector('.group.upcoming .count')?.textContent?.trim()).toBe('1');
    TestBed.resetTestingModule();
    expect((await render(null, [], [])).querySelector('.group.upcoming')).toBeNull();
  });
});
