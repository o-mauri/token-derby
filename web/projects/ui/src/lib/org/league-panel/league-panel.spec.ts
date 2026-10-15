import { TestBed } from '@angular/core/testing';
import { RESIZE_OBSERVER } from '../../layout/resize-observer';
import { LEAGUE_VIEW } from '../fixture';
import type { LeaguePanelView } from '../models';
import { LeaguePanel, leagueRowsThatFit } from './league-panel';

describe('leagueRowsThatFit', () => {
  it('fits whole rows under the leader, never fewer than two', () => {
    expect(leagueRowsThatFit(300, 60, 24)).toBe(10);
    expect(leagueRowsThatFit(120, 60, 24)).toBe(2);
    expect(leagueRowsThatFit(0, 60, 24)).toBe(2);
    expect(leagueRowsThatFit(300, 60, 0)).toBe(2);
  });
});

/** A ResizeObserver stand-in the test can fire with a height. */
class FakeObserver {
  static last: FakeObserver | null = null;
  constructor(private readonly cb: ResizeObserverCallback) { FakeObserver.last = this; }
  observe(): void {}
  disconnect(): void {}
  fire(height: number): void { this.cb([{ contentRect: { height } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
}

async function render(view: LeaguePanelView, rows?: { body: number; head: number; row: number }) {
  TestBed.configureTestingModule({ providers: [{ provide: RESIZE_OBSERVER, useValue: FakeObserver }] });
  const f = TestBed.createComponent(LeaguePanel);
  f.componentRef.setInput('view', view);
  await f.whenStable();
  if (rows) {
    f.componentInstance.measure(rows.head, rows.row);
    FakeObserver.last?.fire(rows.body);
    await f.whenStable();
  }
  return f.nativeElement as HTMLElement;
}
const counts = (el: HTMLElement) => [...el.querySelectorAll('.division')].map((d) => d.querySelectorAll('.runner').length);

describe('LeaguePanel', () => {
  it('shows the season, round and how many are left', async () => {
    const el = await render(LEAGUE_VIEW);
    expect(el.querySelector('.season')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Season 3 Round 6 of 10');
    expect(el.querySelector('.to-go')?.textContent?.trim()).toBe('4 to go');
  });

  it('gives each division a column with its leader', async () => {
    const el = await render(LEAGUE_VIEW);
    expect([...el.querySelectorAll('.division .div-name')].map((n) => n.textContent?.trim())).toEqual(['Premier', 'Championship', 'League One']);
    expect(el.querySelector('.division .leader .name')?.textContent?.trim()).toBe('Gallopz');
  });

  it('shows 2nd place and the count until it knows its height', async () => {
    const el = await render(LEAGUE_VIEW);
    expect(counts(el)).toEqual([1, 1, 1]);
    expect(el.querySelector('.division .more')?.textContent?.trim()).toBe('+7 more');
  });

  it('drops 3rd place in a tight panel, so "+N more" still fits', async () => {
    // 2 rows fit: 2nd place, then the count.
    const el = await render(LEAGUE_VIEW, { body: 110, head: 60, row: 24 });
    expect(counts(el)).toEqual([1, 1, 1]);
    expect(el.querySelector('.division .more')?.textContent?.trim()).toBe('+7 more');
  });

  it('fills a tall panel with as many rows as fit, the same in every column', async () => {
    // 300px body, 60px header+leader, 24px rows: 10 fit; Premier has 8 runners, the others fewer.
    expect(counts(await render(LEAGUE_VIEW, { body: 300, head: 60, row: 24 }))).toEqual([8, 4, 3]);
  });

  it('closes an overflowing column with "+N more", which takes a row itself', async () => {
    // 5 rows fit: Premier's 8 runners show 4 and "+4 more".
    const el = await render(LEAGUE_VIEW, { body: 180, head: 60, row: 24 });
    expect(counts(el)).toEqual([4, 4, 3]);
    expect(el.querySelector('.division .more')?.textContent?.trim()).toBe('+4 more');
  });

  it('notes divisions beyond the third', async () => {
    const el = await render({ ...LEAGUE_VIEW!, moreDivisions: 2 });
    expect(el.querySelector('.more-divisions')?.textContent?.trim()).toBe('+2 more divisions');
    TestBed.resetTestingModule();
    const one = await render({ ...LEAGUE_VIEW!, moreDivisions: 1 });
    expect(one.querySelector('.more-divisions')?.textContent?.trim()).toBe('+1 more division');
  });

  it('says "No league" when the org has none', async () => {
    const el = await render(null);
    expect(el.querySelector('.empty')?.textContent?.trim()).toBe('No league');
  });
});
