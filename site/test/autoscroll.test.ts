import { describe, it, expect } from 'vitest';
import { computeAutoScrollY, startAutoScroll, BOUNCE } from '../src/render/autoscroll.js';

const { HOLD_MS, SCROLL_MS } = BOUNCE;
const CYCLE = 2 * HOLD_MS + 2 * SCROLL_MS;

/** Fake window whose only rAF callback is held so the test can step time. */
function makeHarness(tvOn: boolean) {
  let now = 0;
  let pending: FrameRequestCallback | null = null;
  const win = {
    document: { body: { classList: { contains: (c: string) => tvOn && c === 'tv' } } },
    performance: { now: () => now },
    requestAnimationFrame: (cb: FrameRequestCallback) => {
      pending = cb;
      return 1;
    },
    cancelAnimationFrame: () => {
      pending = null;
    },
  } as unknown as Window;
  const target = { scrollHeight: 2000, clientHeight: 500, scrollTop: 0 } as HTMLElement;
  const step = (t: number) => {
    now = t;
    const cb = pending;
    pending = null;
    cb?.(t);
  };
  return { win, target, step };
}

describe('computeAutoScrollY', () => {
  it('returns 0 when content fits the viewport', () => {
    expect(computeAutoScrollY(0, 0)).toBe(0);
    expect(computeAutoScrollY(50_000, 0)).toBe(0);
    expect(computeAutoScrollY(50_000, -10)).toBe(0);
  });

  it('holds at top for the hold duration at start', () => {
    expect(computeAutoScrollY(0, 1000)).toBe(0);
    expect(computeAutoScrollY(HOLD_MS - 1, 1000)).toBe(0);
  });

  it('begins scrolling down at exactly the hold boundary', () => {
    expect(computeAutoScrollY(HOLD_MS, 1000)).toBe(0);
  });

  it('reaches the midpoint at hold + scroll/2', () => {
    expect(computeAutoScrollY(HOLD_MS + SCROLL_MS / 2, 1000)).toBe(500);
  });

  it('reaches the bottom at hold + scroll', () => {
    expect(computeAutoScrollY(HOLD_MS + SCROLL_MS, 1000)).toBe(1000);
  });

  it('holds at the bottom for the hold duration', () => {
    expect(computeAutoScrollY(HOLD_MS + SCROLL_MS + 100, 1000)).toBe(1000);
    expect(computeAutoScrollY(HOLD_MS + SCROLL_MS + HOLD_MS - 1, 1000)).toBe(1000);
  });

  it('scrolls back up linearly during the return phase', () => {
    const baseT = HOLD_MS + SCROLL_MS + HOLD_MS;
    expect(computeAutoScrollY(baseT, 1000)).toBe(1000);
    expect(computeAutoScrollY(baseT + SCROLL_MS / 2, 1000)).toBe(500);
    expect(computeAutoScrollY(baseT + SCROLL_MS, 1000)).toBe(0);
  });

  it('repeats the cycle after a full period', () => {
    expect(computeAutoScrollY(CYCLE, 1000)).toBe(0);
    expect(computeAutoScrollY(CYCLE + HOLD_MS, 1000)).toBe(0);
    expect(computeAutoScrollY(CYCLE + HOLD_MS + SCROLL_MS / 2, 1000)).toBe(500);
  });

  it('clamps and rounds to integer pixels', () => {
    const y = computeAutoScrollY(HOLD_MS + SCROLL_MS / 3, 1000);
    expect(Number.isInteger(y)).toBe(true);
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(1000);
  });
});

describe('startAutoScroll', () => {
  it('drives the track scroll whenever body has the tv class (manual toggle, any screen)', () => {
    const { win, target, step } = makeHarness(true);
    startAutoScroll({ signal: new AbortController().signal, target, win });
    step(0); // first frame: holds at top
    expect(target.scrollTop).toBe(0);
    step(HOLD_MS + SCROLL_MS / 2); // midpoint of the down-scroll
    expect(target.scrollTop).toBe((2000 - 500) / 2); // 750
  });

  it('does not scroll when tv mode is off', () => {
    const { win, target, step } = makeHarness(false);
    startAutoScroll({ signal: new AbortController().signal, target, win });
    step(HOLD_MS + SCROLL_MS / 2);
    expect(target.scrollTop).toBe(0);
  });

  it('stops scrolling and resets to top on abort', () => {
    const ctrl = new AbortController();
    const { win, target, step } = makeHarness(true);
    startAutoScroll({ signal: ctrl.signal, target, win });
    step(HOLD_MS + SCROLL_MS / 2);
    expect(target.scrollTop).toBe(750);
    ctrl.abort();
    expect(target.scrollTop).toBe(0);
    step(HOLD_MS + SCROLL_MS); // no further frames should run
    expect(target.scrollTop).toBe(0);
  });
});
