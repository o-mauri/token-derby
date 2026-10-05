import { TestBed } from '@angular/core/testing';
import { LIVE_VIEW, NEXT_VIEW } from '../fixture';
import type { LivePanelView } from '../models';
import { LivePanel } from './live-panel';

async function render(view: LivePanelView) {
  const f = TestBed.createComponent(LivePanel);
  f.componentRef.setInput('view', view);
  await f.whenStable();
  return f.nativeElement as HTMLElement;
}
const text = (el: HTMLElement, sel: string) => el.querySelector(sel)?.textContent?.trim();

describe('LivePanel', () => {
  it('heads the panel with the race name and shows the leader with compact tokens and pace', async () => {
    const el = await render(LIVE_VIEW);
    expect(text(el, '.title .race')).toBe('Friday Sprint');
    expect(text(el, '.lead .name')).toBe('Gallopz');
    expect(text(el, '.lead .tokens')).toBe('4.21M');
    expect(text(el, '.lead .meta')).toContain('+62.4K/min');
    expect(el.querySelector('.hero td-horse.lead-sprite')).not.toBeNull();
  });

  it('lists places 2 to 5 with their gaps to the leader', async () => {
    const el = await render(LIVE_VIEW);
    const rows = [...el.querySelectorAll('.chasers .row')];
    expect(rows.map((r) => r.querySelector('.place')?.textContent?.trim())).toEqual(['2', '3', '4', '5']);
    expect(rows[0]!.querySelector('.gap')?.textContent?.trim()).toBe('-830K');
  });

  it('shows the code, field size, LIVE chip, countdown and share run', async () => {
    const el = await render(LIVE_VIEW);
    expect(text(el, '.side .code')).toBe('K7QX · 12 runners');
    expect(el.querySelector('.side td-status-chip')).not.toBeNull();
    expect(el.querySelector('.side td-countdown')).not.toBeNull();
    expect(text(el, '.side .run')).toBe('27% run');
  });

  it('keeps the title and countdown when the live race details failed to load', async () => {
    const el = await render({ ...LIVE_VIEW, leader: null, chasers: [], runners: null });
    expect(text(el, '.title .race')).toBe('Friday Sprint');
    expect(el.querySelector('.side td-countdown')).not.toBeNull();
    expect(el.querySelector('.lead')).toBeNull();
    expect(text(el, '.side .code')).toBe('K7QX');
  });

  it('shows the next race with a "Starts in" countdown', async () => {
    const el = await render(NEXT_VIEW);
    expect(text(el, '.title .race')).toBe('Friday Sprint');
    expect(text(el, '.side .starts')).toBe('STARTS IN');
    expect(el.querySelector('.side td-countdown')).not.toBeNull();
  });

  it('says so when there is no race at all', async () => {
    const el = await render({ kind: 'none' });
    expect(text(el, '.none')).toBe('NO CURRENT RACE');
  });
});
