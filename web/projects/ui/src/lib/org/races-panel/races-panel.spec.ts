import { TestBed } from '@angular/core/testing';
import { RACES_VIEW } from '../fixture';
import type { RacesPanelView } from '../models';
import { RacesPanel } from './races-panel';

async function render(view: RacesPanelView) {
  const f = TestBed.createComponent(RacesPanel);
  f.componentRef.setInput('view', view);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}
const text = (el: Element | null | undefined, sel: string) => el?.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim();

describe('RacesPanel', () => {
  it('shows the next race with its countdown', async () => {
    const el = await render(RACES_VIEW);
    expect(text(el, '.next .name')).toBe('Friday Sprint');
    expect(el.querySelector('.next td-countdown')).not.toBeNull();
  });

  it('lists the latest results with the winner, compact tokens and field size', async () => {
    const el = await render(RACES_VIEW);
    expect(text(el, '.head .count')).toBe('47 races');
    const rows = [...el.querySelectorAll('.result')];
    expect(rows).toHaveLength(3);
    expect(text(rows[0], '.winner .name')).toBe('Hay Girl');
    expect(rows[0]!.querySelector('td-horse')).not.toBeNull();
    expect(text(rows[0], '.tokens')).toBe('12.1M');
    expect(text(rows[0], '.ran')).toBe('11 ran');
  });

  it('hides the next strip when nothing is coming up', async () => {
    const el = await render({ ...RACES_VIEW, next: null });
    expect(el.querySelector('.next')).toBeNull();
  });

  it('shows "—" for figures the API has not reported yet', async () => {
    const el = await render({ ...RACES_VIEW, latest: [{ ...RACES_VIEW.latest[0]!, runners: null, tokens: null }] });
    expect(text(el, '.result .ran')).toBe('—');
    expect(text(el, '.result .tokens')).toBe('—');
  });
});
