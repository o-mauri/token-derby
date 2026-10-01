// The crowd is one 32×32 spectator sprite (4 stacked cheer frames) repeated
// across the width of the frame. Repeating it with `background-repeat` made every
// spectator cheer on the same beat, which reads as one sprite copied N times — so
// each spectator is its own element carrying a randomised cycle length and start
// offset instead.

export const TILE_PX = 32;

export const CHEER = {
  MIN_MS: 700,
  MAX_MS: 1_500,
} as const;

/** Sprite tiles needed to COVER `frameWidthPx`, caps included.
 *
 *  Rounds up, not down. Flooring left up to one tile of frame unfilled, which
 *  `justify-self: center` then split between the two ends — invisible while the
 *  crowd was only sprites on a transparent strip, but the London theme hangs a
 *  continuous bridge and skyline off this element, and a parapet that stops
 *  short of both edges reads as a bug. The overflowing tile tucks behind the
 *  right-hand cap, which paints after it, and .crowd's `overflow: hidden`
 *  catches whatever is still proud of the edge. */
export function crowdColumns(frameWidthPx: number, scale: number): number {
  const tile = scale * TILE_PX;
  if (!(tile > 0)) return 0;
  return Math.max(0, Math.ceil(frameWidthPx / tile));
}

export type CheerJitter = { durationMs: number; delayMs: number };

export function cheerJitter(rand: () => number = Math.random): CheerJitter {
  const durationMs = Math.round(CHEER.MIN_MS + rand() * (CHEER.MAX_MS - CHEER.MIN_MS));
  // Negative delay drops the sprite mid-cycle rather than holding frame 0 until
  // its turn comes round, so the crowd is already out of step on the first frame.
  return { durationMs, delayMs: -Math.round(rand() * durationMs) };
}

export function applyCheerJitter(el: HTMLElement, rand: () => number = Math.random): void {
  const { durationMs, delayMs } = cheerJitter(rand);
  el.style.setProperty('--cheer-duration', `${durationMs}ms`);
  el.style.setProperty('--cheer-delay', `${delayMs}ms`);
}

/**
 * Grow/shrink `body` to `count` spectators. Existing elements are left alone so a
 * resize doesn't re-roll the phase of the whole crowd (which would show up as
 * every spectator snapping to a new frame at once).
 */
export function syncSpectators(body: HTMLElement, count: number, rand: () => number = Math.random): void {
  while (body.childElementCount > count) body.lastElementChild!.remove();
  while (body.childElementCount < count) {
    const person = body.ownerDocument.createElement('div');
    person.className = 'crowd-person';
    applyCheerJitter(person, rand);
    body.appendChild(person);
  }
}
