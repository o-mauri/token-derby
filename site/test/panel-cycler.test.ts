import { describe, it, expect } from 'vitest';
import { startCycler } from '../src/render/panel-cycler.js';

function fakeWin() {
  let cb: (() => void) | null = null;
  let cleared = false;
  const win = {
    setInterval: (fn: () => void) => { cb = fn; return 1; },
    clearInterval: () => { cleared = true; },
  } as unknown as Window;
  return { win, tick: () => cb && cb(), wasCleared: () => cleared };
}

function panels(n: number): HTMLElement[] {
  return Array.from({ length: n }, () => document.createElement('div'));
}
const active = (ps: HTMLElement[]) => ps.findIndex((p) => p.classList.contains('is-active'));

describe('startCycler', () => {
  it('starts on panel 0 and advances with wrap', () => {
    const ps = panels(3);
    const { win, tick } = fakeWin();
    startCycler({ panels: ps, intervalMs: 8000, win });
    expect(active(ps)).toBe(0);
    tick(); expect(active(ps)).toBe(1);
    tick(); expect(active(ps)).toBe(2);
    tick(); expect(active(ps)).toBe(0);
  });

  it('does not start a timer for a single panel', () => {
    const ps = panels(1);
    const { win, wasCleared } = fakeWin();
    const c = startCycler({ panels: ps, intervalMs: 8000, win });
    expect(active(ps)).toBe(0);
    c.destroy();
    expect(wasCleared()).toBe(false); // never set, nothing to clear
  });

  it('destroy clears the interval', () => {
    const ps = panels(2);
    const { win, wasCleared } = fakeWin();
    startCycler({ panels: ps, intervalMs: 8000, win }).destroy();
    expect(wasCleared()).toBe(true);
  });

  it('next/prev step with wrap and report every change via onChange', () => {
    const ps = panels(3);
    const { win } = fakeWin();
    const seen: number[] = [];
    const c = startCycler({ panels: ps, intervalMs: 8000, win, onChange: (i) => seen.push(i) });
    expect(active(ps)).toBe(0);
    c.next(); expect(active(ps)).toBe(1);
    c.next(); expect(active(ps)).toBe(2);
    c.next(); expect(active(ps)).toBe(0); // wrap forward
    c.prev(); expect(active(ps)).toBe(2); // wrap backward
    expect(seen).toEqual([0, 1, 2, 0, 2]); // initial 0, then each step
  });

  it('goTo jumps directly to an index', () => {
    const ps = panels(4);
    const { win } = fakeWin();
    const c = startCycler({ panels: ps, intervalMs: 8000, win });
    c.goTo(2); expect(active(ps)).toBe(2);
    c.goTo(0); expect(active(ps)).toBe(0);
  });

  it('resets the auto-advance timer on manual navigation', () => {
    const ps = panels(3);
    let sets = 0; let clears = 0;
    const win = {
      setInterval: () => { sets++; return sets; },
      clearInterval: () => { clears++; },
    } as unknown as Window;
    const c = startCycler({ panels: ps, intervalMs: 8000, win });
    expect(sets).toBe(1); // initial timer
    c.next();
    expect(clears).toBe(1); // old timer cleared
    expect(sets).toBe(2);   // fresh timer started from the new position
  });
});
