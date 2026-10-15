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

