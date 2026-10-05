import { BOUNCE, computeAutoScrollY } from './autoscroll';
import { AutoScrollController } from './autoscroll-controller';

const { HOLD_MS, SCROLL_MS, RESUME_MS } = BOUNCE;
const MAX = 1500;

// Mirrors the old startAutoScroll harness: a 2000px track in a 500px window.
function harness() {
  const c = new AutoScrollController(0);
  let scrollTop = 0;
  const frame = (now: number) => {
    const y = c.frame(now, scrollTop, MAX);
    if (y !== null) { scrollTop = y; c.wrote(scrollTop); }
  };
  const manualScrollTo = (now: number, y: number) => { c.suspend(now); scrollTop = y; c.scrolled(now, scrollTop); };
  return { c, frame, manualScrollTo, get top() { return scrollTop; }, set top(v: number) { scrollTop = v; } };
}

describe('AutoScrollController', () => {
  it('follows the bounce curve while left alone', () => {
    const h = harness();
    h.frame(HOLD_MS + SCROLL_MS / 2);
    expect(h.top).toBe(750);
  });

  it('leaves the scroll alone while the viewer is scrolling', () => {
    const h = harness();
    const t0 = HOLD_MS + SCROLL_MS / 2;
    h.frame(t0);
    h.manualScrollTo(t0 + 10, 200);
    h.frame(t0 + 20);
    expect(h.top).toBe(200);
    h.frame(t0 + RESUME_MS - 1);
    expect(h.top).toBe(200);
  });

  it('keeps holding off while momentum keeps firing scroll events', () => {
    const h = harness();
    const t0 = HOLD_MS + SCROLL_MS / 2;
    h.frame(t0);
    h.manualScrollTo(t0, 200);
    h.frame(t0 + RESUME_MS - 1);
    h.top = 180;
    h.c.scrolled(t0 + RESUME_MS - 1, 180);
    h.frame(t0 + RESUME_MS + 1);
    expect(h.top).toBe(180);
  });

  it('resumes from where the viewer left off, in the same direction', () => {
    const h = harness();
    const t0 = HOLD_MS + SCROLL_MS / 2;
    h.frame(t0);
    h.manualScrollTo(t0, 200);
    h.frame(t0 + RESUME_MS);
    expect(h.top).toBe(200);
    h.frame(t0 + RESUME_MS + SCROLL_MS / 10);
    expect(h.top).toBe(200 + MAX / 10);
  });

  it('resumes upwards when the bounce was on its way back up', () => {
    const h = harness();
    const t0 = HOLD_MS + SCROLL_MS + HOLD_MS + SCROLL_MS / 2;
    h.frame(t0);
    expect(h.top).toBe(750);
    h.manualScrollTo(t0, 1200);
    h.frame(t0 + RESUME_MS);
    expect(h.top).toBe(1200);
    h.frame(t0 + RESUME_MS + SCROLL_MS / 10);
    expect(h.top).toBe(1200 - MAX / 10);
  });

  it('ignores the scroll events its own writes produce', () => {
    const h = harness();
    const t0 = HOLD_MS + SCROLL_MS / 2;
    h.frame(t0);
    h.c.scrolled(t0, h.top);
    h.frame(t0 + SCROLL_MS / 10);
    expect(h.top).toBe(computeAutoScrollY(t0 + SCROLL_MS / 10, MAX));
  });

  it('treats only scroll keys as manual input', () => {
    expect(AutoScrollController.isScrollKey('PageDown')).toBe(true);
    expect(AutoScrollController.isScrollKey(' ')).toBe(true);
    expect(AutoScrollController.isScrollKey('a')).toBe(false);
  });
});
