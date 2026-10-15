import { TestBed } from '@angular/core/testing';
import { PendingBanner } from './pending-banner';
import { NOW } from '../countdown/countdown';

describe('PendingBanner', () => {
  const now = Date.parse('2026-04-22T08:59:30Z');
  beforeEach(() => TestBed.configureTestingModule({ providers: [{ provide: NOW, useValue: () => now }] }));

  async function render(startsAt: string) {
    const f = TestBed.createComponent(PendingBanner);
    f.componentRef.setInput('startsAt', startsAt);
    await f.whenStable();
    return { f, el: f.nativeElement as HTMLElement };
  }

  it('counts down to the start on the LED clock', async () => {
    const { el } = await render('2026-04-22T09:00:00Z');
    expect(el.textContent).toContain('Race starts in');
    expect(el.querySelector('td-countdown')!.textContent?.replace(/\s/g, '')).toBe('00:00:30');
    expect(el.getAttribute('role')).toBe('status');
  });

  it('says it is starting once the start time has passed', async () => {
    const { el } = await render('2026-04-22T08:00:00Z');
    expect(el.textContent?.trim()).toBe('Starting…');
    expect(el.querySelector('td-countdown')).toBeNull();
  });

  it('switches to starting when the countdown runs out', async () => {
    const { f, el } = await render('2026-04-22T09:00:00Z');
    f.debugElement.query((d) => d.name === 'td-countdown').componentInstance.done.emit();
    await f.whenStable();
    expect(el.textContent?.trim()).toBe('Starting…');
  });
});
