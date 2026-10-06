import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BreakpointObserver } from '@angular/cdk/layout';
import { of } from 'rxjs';
import { FRAME_CLOCK, type FrameClock } from '../race/track/auto-scroll';
import { TimedTab, TimedTabs } from './timed-tabs';

@Component({
  imports: [TimedTabs, TimedTab],
  template: `
    <td-timed-tabs [interval]="1000" [paused]="paused()" [(selected)]="selected">
      <ng-template tdTab label="Board"><p class="panel-a">Board panel</p></ng-template>
      <ng-template tdTab label="Tokens"><p class="panel-b">Tokens panel</p></ng-template>
      <ng-template tdTab label="Pace"><p class="panel-c">Pace panel</p></ng-template>
    </td-timed-tabs>`,
})
class Host { selected = 0; readonly paused = signal(false); }

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
  const el = f.nativeElement as HTMLElement;
  const advance = async (ms: number, step = 100) => {
    for (let t = 0; t < ms; t += step) { now += step; const cb = pending; pending = null; cb?.(); }
    await f.whenStable();
  };
  const tabs = () => [...el.querySelectorAll<HTMLElement>('[role="tab"]')];
  const panel = () => el.querySelector('[role="tabpanel"]')!;
  return { f, el, advance, tabs, panel };
}

describe('TimedTabs', () => {
  it('renders a labelled tab per template with proper tab ARIA', async () => {
    const { f, tabs, panel, el } = setup();
    await f.whenStable();
    expect(el.querySelector('[role="tablist"]')).not.toBeNull();
    expect(tabs().map((t) => t.textContent?.trim())).toEqual(['Board', 'Tokens', 'Pace']);
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(panel().getAttribute('aria-labelledby')).toBe(tabs()[0]!.id);
    expect(panel().textContent?.trim()).toBe('Board panel');
  });

  it('fills the active tab\'s timer and moves on when it runs out, wrapping at the end', async () => {
    const { f, advance, tabs, panel } = setup();
    await f.whenStable();
    await advance(500);
    expect(tabs()[0]!.style.getPropertyValue('--progress')).toBe('0.5');
    await advance(600);
    expect(f.componentInstance.selected).toBe(1);
    expect(panel().textContent?.trim()).toBe('Tokens panel');
    await advance(2100);
    expect(f.componentInstance.selected).toBe(0);
  });

  it('jumps to a clicked tab and restarts its timer', async () => {
    const { f, advance, tabs } = setup();
    await f.whenStable();
    await advance(800);
    tabs()[2]!.click();
    await f.whenStable();
    expect(f.componentInstance.selected).toBe(2);
    await advance(500);
    expect(f.componentInstance.selected).toBe(2);
  });

  it('holds while hovered or paused', async () => {
    const { f, el, advance } = setup();
    await f.whenStable();
    // 2.5s would carry it to the third tab if nothing held it.
    el.querySelector('td-timed-tabs')!.dispatchEvent(new Event('mouseenter'));
    await advance(2500);
    expect(f.componentInstance.selected).toBe(0);
    el.querySelector('td-timed-tabs')!.dispatchEvent(new Event('mouseleave'));
    f.componentInstance.paused.set(true);
    await f.whenStable();
    await advance(2500);
    expect(f.componentInstance.selected).toBe(0);
  });

  it('moves between tabs with the arrow keys, Home and End, keeping focus on the selected tab', async () => {
    const { f, tabs, el } = setup();
    await f.whenStable();
    const list = el.querySelector('[role="tablist"]')!;
    const key = async (k: string) => { list.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); await f.whenStable(); };
    await key('ArrowRight');
    expect(f.componentInstance.selected).toBe(1);
    expect(document.activeElement).toBe(tabs()[1]);
    await key('ArrowLeft'); await key('ArrowLeft');
    expect(f.componentInstance.selected).toBe(2);
    await key('Home');
    expect(f.componentInstance.selected).toBe(0);
    await key('End');
    expect(f.componentInstance.selected).toBe(2);
  });

  it('swipes between views on touch', async () => {
    const { f, panel } = setup();
    await f.whenStable();
    const swipe = async (from: number, to: number) => {
      panel().dispatchEvent(new PointerEvent('pointerdown', { clientX: from, bubbles: true }));
      panel().dispatchEvent(new PointerEvent('pointerup', { clientX: to, bubbles: true }));
      await f.whenStable();
    };
    await swipe(300, 200);
    expect(f.componentInstance.selected).toBe(1);
    await swipe(200, 300);
    expect(f.componentInstance.selected).toBe(0);
    await swipe(200, 220);
    expect(f.componentInstance.selected).toBe(0);
  });

  it('still advances under reduced motion, without the filling underline', async () => {
    const { f, advance, el } = setup(true);
    await f.whenStable();
    expect(el.querySelector('td-timed-tabs')!.classList.contains('still')).toBe(true);
    await advance(1100);
    expect(f.componentInstance.selected).toBe(1);
  });
});
