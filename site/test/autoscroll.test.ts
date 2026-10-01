import { describe, it, expect } from 'vitest';
import {
  computeAutoScrollY,
  autoScrollDirection,
  phaseForScrollY,
  startAutoScroll,
  BOUNCE,
} from '../src/render/autoscroll.js';

const { HOLD_MS, SCROLL_MS, RESUME_MS } = BOUNCE;
const CYCLE = 2 * HOLD_MS + 2 * SCROLL_MS;

/** Minimal event-target stand-in: fires every listener registered for a type. */
function makeEmitter() {
  const listeners = new Map<string, Set<(ev: unknown) => void>>();
  return {
    addEventListener: (type: string, fn: (ev: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (ev: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
    emit: (type: string, ev?: unknown) => {
      listeners.get(type)?.forEach((fn) => fn(ev));
    },
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

/** Fake window whose only rAF callback is held so the test can step time. */
function makeHarness(tvOn: boolean) {
  let now = 0;
  let pending: FrameRequestCallback | null = null;
  const winEvents = makeEmitter();
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
    addEventListener: winEvents.addEventListener,
    removeEventListener: winEvents.removeEventListener,
  } as unknown as Window;
  const targetEvents = makeEmitter();
  const target = {
    scrollHeight: 2000,
    clientHeight: 500,
    scrollTop: 0,
    addEventListener: targetEvents.addEventListener,
    removeEventListener: targetEvents.removeEventListener,
  } as unknown as HTMLElement;
  const step = (t: number) => {
    now = t;
    const cb = pending;
    pending = null;
    cb?.(t);
  };
  /** Viewer drags the track to `y`: the gesture event, then the scroll it causes. */
  const manualScrollTo = (y: number) => {
    targetEvents.emit('wheel');
    target.scrollTop = y;
    targetEvents.emit('scroll');
  };
  return { win, target, step, manualScrollTo, winEvents, targetEvents };
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

  it('drops its listeners on abort', () => {
    const ctrl = new AbortController();
    const { win, target, winEvents, targetEvents } = makeHarness(true);
    startAutoScroll({ signal: ctrl.signal, target, win });
    expect(targetEvents.count('wheel')).toBe(1);
    expect(winEvents.count('keydown')).toBe(1);
    ctrl.abort();
    expect(targetEvents.count('wheel')).toBe(0);
    expect(targetEvents.count('scroll')).toBe(0);
    expect(winEvents.count('keydown')).toBe(0);
  });
});

describe('startAutoScroll manual override', () => {
  it('leaves the scroll alone while the viewer is scrolling', () => {
    const { win, target, step, manualScrollTo } = makeHarness(true);
    startAutoScroll({ signal: new AbortController().signal, target, win });
    step(HOLD_MS + SCROLL_MS / 2);
    expect(target.scrollTop).toBe(750);

    step(HOLD_MS + SCROLL_MS / 2 + 10);
    manualScrollTo(200);
    step(HOLD_MS + SCROLL_MS / 2 + 20); // next frame must not yank it back
    expect(target.scrollTop).toBe(200);
    step(HOLD_MS + SCROLL_MS / 2 + RESUME_MS - 1);
    expect(target.scrollTop).toBe(200);
  });

  it('keeps holding off while momentum scrolling keeps firing scroll events', () => {
    const { win, target, step, manualScrollTo, targetEvents } = makeHarness(true);
    startAutoScroll({ signal: new AbortController().signal, target, win });
    step(HOLD_MS + SCROLL_MS / 2);
    const t0 = HOLD_MS + SCROLL_MS / 2;

    manualScrollTo(200);
    step(t0 + RESUME_MS - 1);
    target.scrollTop = 180; // inertia carries on after the gesture ends
    targetEvents.emit('scroll');
    step(t0 + RESUME_MS + 1); // past the original deadline
    expect(target.scrollTop).toBe(180);
  });

  it('resumes from where the viewer left off, in the same direction', () => {
    const { win, target, step, manualScrollTo } = makeHarness(true);
    startAutoScroll({ signal: new AbortController().signal, target, win });
    const maxScroll = 1500;
    step(HOLD_MS + SCROLL_MS / 2); // heading down, halfway
    const t0 = HOLD_MS + SCROLL_MS / 2;

    manualScrollTo(200);
    step(t0 + RESUME_MS); // quiet again: pick the bounce up at 200
    expect(target.scrollTop).toBe(200);

    step(t0 + RESUME_MS + SCROLL_MS / 10); // carries on downwards at the normal rate
    expect(target.scrollTop).toBe(200 + maxScroll / 10);
  });

  it('resumes upwards when the bounce was on its way back up', () => {
    const { win, target, step, manualScrollTo } = makeHarness(true);
    startAutoScroll({ signal: new AbortController().signal, target, win });
    const upLeg = HOLD_MS + SCROLL_MS + HOLD_MS;
    step(upLeg + SCROLL_MS / 2); // heading up, halfway
    expect(target.scrollTop).toBe(750);
    const t0 = upLeg + SCROLL_MS / 2;

    manualScrollTo(1200);
    step(t0 + RESUME_MS);
    expect(target.scrollTop).toBe(1200);
    step(t0 + RESUME_MS + SCROLL_MS / 10);
    expect(target.scrollTop).toBe(1200 - 1500 / 10);
  });

  it('treats scroll keys as manual input but ignores other keys', () => {
    const { win, target, step, winEvents } = makeHarness(true);
    startAutoScroll({ signal: new AbortController().signal, target, win });
    step(HOLD_MS + SCROLL_MS / 2);
    const t0 = HOLD_MS + SCROLL_MS / 2;

    winEvents.emit('keydown', { key: 'a' });
    step(t0 + 10);
    expect(target.scrollTop).toBe(computeAutoScrollY(t0 + 10, 1500));

    winEvents.emit('keydown', { key: 'PageDown' });
    target.scrollTop = 900;
    step(t0 + 20);
    expect(target.scrollTop).toBe(900);
  });

  it('ignores the scroll events its own writes produce', () => {
    const { win, target, step, targetEvents } = makeHarness(true);
    startAutoScroll({ signal: new AbortController().signal, target, win });
    step(HOLD_MS + SCROLL_MS / 2);
    targetEvents.emit('scroll'); // fired by our own scrollTop write
    step(HOLD_MS + SCROLL_MS / 2 + SCROLL_MS / 10);
    expect(target.scrollTop).toBe(computeAutoScrollY(HOLD_MS + SCROLL_MS / 2 + SCROLL_MS / 10, 1500));
  });
});

describe('autoScrollDirection', () => {
  it('reads the hold legs as the direction they precede', () => {
    expect(autoScrollDirection(0)).toBe('down');
    expect(autoScrollDirection(HOLD_MS + SCROLL_MS / 2)).toBe('down');
    expect(autoScrollDirection(HOLD_MS + SCROLL_MS)).toBe('up'); // bottom hold
    expect(autoScrollDirection(CYCLE - 1)).toBe('up');
    expect(autoScrollDirection(CYCLE)).toBe('down');
  });
});

describe('phaseForScrollY', () => {
  it('inverts computeAutoScrollY on the down leg', () => {
    const t = phaseForScrollY(600, 1000, 'down');
    expect(computeAutoScrollY(t, 1000)).toBe(600);
  });

  it('inverts computeAutoScrollY on the up leg', () => {
    const t = phaseForScrollY(600, 1000, 'up');
    expect(autoScrollDirection(t)).toBe('up');
    expect(computeAutoScrollY(t, 1000)).toBe(600);
  });

  it('clamps out-of-range positions and handles a track that fits', () => {
    expect(computeAutoScrollY(phaseForScrollY(-50, 1000, 'down'), 1000)).toBe(0);
    expect(computeAutoScrollY(phaseForScrollY(5000, 1000, 'down'), 1000)).toBe(1000);
    expect(phaseForScrollY(0, 0, 'down')).toBe(0);
  });
});
