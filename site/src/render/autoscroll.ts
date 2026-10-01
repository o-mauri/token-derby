export const BOUNCE = {
  HOLD_MS: 3_000,
  SCROLL_MS: 30_000,
  /** Quiet time after the last manual scroll before the bounce takes over again. */
  RESUME_MS: 5_000,
} as const;

/** Which way the bounce is travelling; the holds count as the leg they precede. */
export type ScrollDirection = 'down' | 'up';

function phaseAt(elapsedMs: number): number {
  const cycle = 2 * BOUNCE.HOLD_MS + 2 * BOUNCE.SCROLL_MS;
  return ((elapsedMs % cycle) + cycle) % cycle;
}

export function computeAutoScrollY(elapsedMs: number, maxScroll: number): number {
  if (maxScroll <= 0) return 0;
  const { HOLD_MS, SCROLL_MS } = BOUNCE;
  const t = phaseAt(elapsedMs);

  if (t < HOLD_MS) return 0;
  if (t < HOLD_MS + SCROLL_MS) {
    const p = (t - HOLD_MS) / SCROLL_MS;
    return Math.round(maxScroll * p);
  }
  if (t < HOLD_MS + SCROLL_MS + HOLD_MS) return maxScroll;
  const p = (t - HOLD_MS - SCROLL_MS - HOLD_MS) / SCROLL_MS;
  return Math.round(maxScroll * (1 - p));
}

export function autoScrollDirection(elapsedMs: number): ScrollDirection {
  return phaseAt(elapsedMs) < BOUNCE.HOLD_MS + BOUNCE.SCROLL_MS ? 'down' : 'up';
}

/** Inverse of `computeAutoScrollY`: the elapsed time that sits at `y` going `direction`. */
export function phaseForScrollY(y: number, maxScroll: number, direction: ScrollDirection): number {
  if (maxScroll <= 0) return 0;
  const { HOLD_MS, SCROLL_MS } = BOUNCE;
  const p = Math.min(1, Math.max(0, y / maxScroll));
  return direction === 'down'
    ? HOLD_MS + p * SCROLL_MS
    : 2 * HOLD_MS + SCROLL_MS + (1 - p) * SCROLL_MS;
}

export type AutoScrollOptions = {
  signal: AbortSignal;
  target: HTMLElement;
  win?: Window;
};

const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
  'Spacebar',
]);

export function startAutoScroll({ signal, target, win = window }: AutoScrollOptions): void {
  // Drive the scroll whenever TV mode is active. Use the applied `body.tv` class
  // — the same thing that turns the track into a scroll container — rather than
  // the raw media query, so autoscroll also runs when TV mode is enabled via the
  // manual toggle on a screen that isn't physically 21:9 / ≥1920px. Checked each
  // frame so toggling TV on/off takes effect live.
  const tvActive = () => win.document.body.classList.contains('tv');
  let start = win.performance.now(); // phase origin, re-seeded after a manual scroll
  let direction: ScrollDirection = 'down';
  let manualAt = 0; // last manual scroll; 0 while auto-driving
  let written = -1; // last scrollTop we set ourselves
  let raf = 0;

  const suspend = () => {
    manualAt = win.performance.now();
  };

  // Not our own write, so the viewer (or their momentum) moved the track.
  const onScroll = () => {
    if (!manualAt && Math.abs(target.scrollTop - written) <= 1) return;
    suspend();
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (SCROLL_KEYS.has(ev.key)) suspend();
  };

  const tick = () => {
    if (signal.aborted) return;
    raf = win.requestAnimationFrame(tick);
    if (!tvActive()) return;

    const now = win.performance.now();
    if (manualAt) {
      if (now - manualAt < BOUNCE.RESUME_MS) return;
      start = now - phaseForScrollY(target.scrollTop, target.scrollHeight - target.clientHeight, direction);
      manualAt = 0;
    }

    const elapsed = now - start;
    direction = autoScrollDirection(elapsed);
    target.scrollTop = computeAutoScrollY(elapsed, target.scrollHeight - target.clientHeight);
    written = target.scrollTop;
  };

  const passive = { passive: true } as const;
  target.addEventListener('wheel', suspend, passive);
  target.addEventListener('touchstart', suspend, passive);
  target.addEventListener('touchmove', suspend, passive);
  target.addEventListener('scroll', onScroll, passive);
  win.addEventListener('keydown', onKeyDown);

  raf = win.requestAnimationFrame(tick);
  signal.addEventListener(
    'abort',
    () => {
      win.cancelAnimationFrame(raf);
      target.removeEventListener('wheel', suspend);
      target.removeEventListener('touchstart', suspend);
      target.removeEventListener('touchmove', suspend);
      target.removeEventListener('scroll', onScroll);
      win.removeEventListener('keydown', onKeyDown);
      if (tvActive()) target.scrollTop = 0;
    },
    { once: true },
  );
}
