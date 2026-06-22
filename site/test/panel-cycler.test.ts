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
});
