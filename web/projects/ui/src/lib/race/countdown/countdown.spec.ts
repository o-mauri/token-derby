import { TestBed } from '@angular/core/testing';
import { Countdown, NOW } from './countdown';

describe('Countdown', () => {
  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    TestBed.configureTestingModule({ providers: [{ provide: NOW, useValue: () => now }] });
  });
  afterEach(() => vi.useRealTimers());

  async function render(timeLeftSeconds: number) {
    const f = TestBed.createComponent(Countdown);
    f.componentRef.setInput('anchor', { atMs: now, timeLeftSeconds });
    await f.whenStable();
    return f;
  }
  const text = (f: { nativeElement: HTMLElement }) => f.nativeElement.textContent?.trim();

  it('shows the anchored time left as hh:mm:ss', async () => {
    expect(text(await render(3661))).toBe('01:01:01');
  });

  it('ticks down once a second between polls', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const f = await render(300);
    now += 25_000;
    vi.advanceTimersByTime(25_000);
    f.detectChanges();
    expect(text(f)).toBe('00:04:35');
  });

  it('restarts from a fresh anchor when the next poll lands', async () => {
    const f = await render(300);
    now += 10_000;
    f.componentRef.setInput('anchor', { atMs: now, timeLeftSeconds: 120 });
    await f.whenStable();
    expect(text(f)).toBe('00:02:00');
  });

  it('shows blank clock digits before the first poll', async () => {
    const f = TestBed.createComponent(Countdown);
    f.componentRef.setInput('anchor', null);
    await f.whenStable();
    expect(text(f)).toBe('--:--:--');
    expect((f.nativeElement as HTMLElement).getAttribute('aria-label')).toBe('Time left unknown');
  });

  it('draws each character in its own fixed-width clock cell, with narrower colon cells', async () => {
    const f = await render(3661);
    const cells = [...(f.nativeElement as HTMLElement).querySelectorAll('.cell')];
    expect(cells.map((c) => c.textContent)).toEqual(['0', '1', ':', '0', '1', ':', '0', '1']);
    expect(cells.filter((c) => c.classList.contains('colon')).length).toBe(2);
    expect(cells.every((c) => c.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect((f.nativeElement as HTMLElement).getAttribute('aria-label')).toBe('01:01:01 left');
  });

  it('stops ticking when destroyed', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const f = await render(300);
    f.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('emits done once when it reaches zero', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const f = await render(2);
    let done = 0;
    f.componentInstance.done.subscribe(() => done++);
    now += 1000; vi.advanceTimersByTime(1000); f.detectChanges();
    expect(done).toBe(0);
    now += 1000; vi.advanceTimersByTime(1000); f.detectChanges();
    now += 1000; vi.advanceTimersByTime(1000); f.detectChanges();
    expect(done).toBe(1);
  });
});

