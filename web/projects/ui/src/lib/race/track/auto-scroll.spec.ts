import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { AutoScroll, FRAME_CLOCK, type FrameClock } from './auto-scroll';
import { BOUNCE } from '../logic/autoscroll';

@Component({ imports: [AutoScroll], template: `<div tdAutoScroll class="box"></div>` })
class Host {}

function setup(reducedMotion = false) {
  let now = 0;
  let pending: (() => void) | null = null;
  const clock: FrameClock = { now: () => now, request: (cb) => { pending = cb; return 1; }, cancel: () => { pending = null; } };
  TestBed.configureTestingModule({
    providers: [
      { provide: FRAME_CLOCK, useValue: clock },
      { provide: BreakpointObserver, useValue: { observe: () => of({ matches: reducedMotion, breakpoints: {} }) } },
    ],
  });
  const f = TestBed.createComponent(Host);
  const box = f.nativeElement.querySelector('.box') as HTMLElement;
  Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => 2000 });
  Object.defineProperty(box, 'clientHeight', { configurable: true, get: () => 500 });
  const step = (t: number) => { now = t; const cb = pending; pending = null; cb?.(); };
  return { f, box, step, hasFrame: () => pending !== null };
}

describe('AutoScroll', () => {
  it('bounces the element down its overflow on each animation frame', async () => {
    const { f, box, step } = setup();
    await f.whenStable();
    step(BOUNCE.HOLD_MS + BOUNCE.SCROLL_MS / 2);
    expect(box.scrollTop).toBe(750);
  });

  it('backs off when the viewer scrolls with the wheel', async () => {
    const { f, box, step } = setup();
    await f.whenStable();
    step(BOUNCE.HOLD_MS + BOUNCE.SCROLL_MS / 2);
    box.dispatchEvent(new Event('wheel'));
    box.scrollTop = 100;
    step(BOUNCE.HOLD_MS + BOUNCE.SCROLL_MS / 2 + 16);
    expect(box.scrollTop).toBe(100);
  });

  it('stays still under reduced motion', async () => {
    const { f, box, step } = setup(true);
    await f.whenStable();
    step(BOUNCE.HOLD_MS + BOUNCE.SCROLL_MS / 2);
    expect(box.scrollTop).toBe(0);
  });

  it('stops requesting frames once destroyed', async () => {
    const { f, step, hasFrame } = setup();
    await f.whenStable();
    step(10);
    expect(hasFrame()).toBe(true);
    f.destroy();
    expect(hasFrame()).toBe(false);
  });
});
