export const BOUNCE = {
  HOLD_MS: 3_000,
  SCROLL_MS: 30_000,
} as const;

export const TV_MEDIA_QUERY = '(min-aspect-ratio: 2/1) and (min-width: 1920px)';

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
  const mql = win.matchMedia(TV_MEDIA_QUERY);
  const start = win.performance.now();
  let raf = 0;

  const tick = () => {
    if (signal.aborted) return;
    if (mql.matches) {
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
      if (mql.matches) target.scrollTop = 0;
    },
    { once: true },
  );
}
