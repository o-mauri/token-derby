export const BOUNCE = {
  HOLD_MS: 3_000,
  SCROLL_MS: 30_000,
} as const;

export function computeAutoScrollY(elapsedMs: number, maxScroll: number): number {
  if (maxScroll <= 0) return 0;
  const { HOLD_MS, SCROLL_MS } = BOUNCE;
  const cycle = 2 * HOLD_MS + 2 * SCROLL_MS;
  const t = ((elapsedMs % cycle) + cycle) % cycle;

  if (t < HOLD_MS) return 0;
  if (t < HOLD_MS + SCROLL_MS) {
    const p = (t - HOLD_MS) / SCROLL_MS;
    return Math.round(maxScroll * p);
  }
  if (t < HOLD_MS + SCROLL_MS + HOLD_MS) return maxScroll;
  const p = (t - HOLD_MS - SCROLL_MS - HOLD_MS) / SCROLL_MS;
  return Math.round(maxScroll * (1 - p));
}

export type AutoScrollOptions = {
  signal: AbortSignal;
  target: HTMLElement;
  win?: Window;
};

export function startAutoScroll({ signal, target, win = window }: AutoScrollOptions): void {
  // Drive the scroll whenever TV mode is active. Use the applied `body.tv` class
  // — the same thing that turns the track into a scroll container — rather than
  // the raw media query, so autoscroll also runs when TV mode is enabled via the
  // manual toggle on a screen that isn't physically 21:9 / ≥1920px. Checked each
  // frame so toggling TV on/off takes effect live.
  const tvActive = () => win.document.body.classList.contains('tv');
  const start = win.performance.now();
  let raf = 0;

  const tick = () => {
    if (signal.aborted) return;
    if (tvActive()) {
      const maxScroll = target.scrollHeight - target.clientHeight;
      const y = computeAutoScrollY(win.performance.now() - start, maxScroll);
      target.scrollTop = y;
    }
    raf = win.requestAnimationFrame(tick);
  };

  raf = win.requestAnimationFrame(tick);
  signal.addEventListener(
    'abort',
    () => {
      win.cancelAnimationFrame(raf);
      if (tvActive()) target.scrollTop = 0;
    },
    { once: true },
  );
}
