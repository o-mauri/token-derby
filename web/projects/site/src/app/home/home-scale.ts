// The window size at which the column is drawn 1:1; bigger windows scale it up in proportion.
const BASE_WIDTH = 1200;
const BASE_HEIGHT = 720;
const MIN_SCALE = 0.8;
const MAX_SCALE = 1.8;

/** How much to scale the home column: width only ever enlarges it, height can also shrink it a little, so it always fits. */
export function homeScale(width: number, height: number): number {
  const fit = Math.min(Math.max(1, width / BASE_WIDTH), height / BASE_HEIGHT);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
}
