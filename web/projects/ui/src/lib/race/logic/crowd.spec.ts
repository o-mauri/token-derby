import { CHEER, cheerJitter, crowdColumns, resizeCrowd, TILE_PX } from './crowd';

/** Deterministic stand-in for Math.random, cycling the given values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('crowdColumns', () => {
  it('covers the frame, rounding a partial tile up', () => {
    expect(crowdColumns(10 * 2 * TILE_PX, 2)).toBe(10);
    // 31px of an 11th tile still has to be covered, or the strip — and the
    // bridge the London theme hangs off it — stops short of the frame edge.
    expect(crowdColumns(10 * 2 * TILE_PX + 31, 2)).toBe(11);
  });

  it('scales with the sprite scale', () => {
    expect(crowdColumns(960, 3)).toBe(10);
  });

  it('is 0 for a degenerate width or scale', () => {
    expect(crowdColumns(0, 2)).toBe(0);
    expect(crowdColumns(-100, 2)).toBe(0);
    expect(crowdColumns(960, 0)).toBe(0);
  });
});

describe('cheerJitter', () => {
  it('keeps the cycle length inside the configured range', () => {
    expect(cheerJitter(seq(0)).durationMs).toBe(CHEER.MIN_MS);
    expect(cheerJitter(seq(1)).durationMs).toBe(CHEER.MAX_MS);
  });

  it('starts the sprite mid-cycle via a negative delay', () => {
    const { durationMs, delayMs } = cheerJitter(seq(1, 0.5));
    expect(durationMs).toBe(CHEER.MAX_MS);
    expect(delayMs).toBe(-CHEER.MAX_MS / 2);
  });

  it('never delays past one full cycle', () => {
    for (let i = 0; i < 200; i++) {
      const { durationMs, delayMs } = cheerJitter();
      expect(delayMs).toBeLessThanOrEqual(0);
      expect(delayMs).toBeGreaterThanOrEqual(-durationMs);
    }
  });
});

describe('resizeCrowd', () => {
  it('gives each new spectator its own cycle and offset', () => {
    const crowd = resizeCrowd([], 3, seq(0, 0, 1, 0.5, 0.25, 1));
    expect(crowd.length).toBe(3);
    expect(new Set(crowd.map((c) => `${c.durationMs}/${c.delayMs}`)).size).toBe(3);
    expect(crowd[0]).toEqual({ durationMs: CHEER.MIN_MS, delayMs: -0 });
  });

  it('keeps existing spectators when growing, so a resize does not re-roll the whole crowd', () => {
    const before = resizeCrowd([], 2, seq(0.1, 0.2, 0.3, 0.4));
    const after = resizeCrowd(before, 4, seq(0.9));
    expect(after.slice(0, 2)).toEqual(before);
    expect(after.length).toBe(4);
  });

  it('drops spectators from the end when shrinking', () => {
    const before = resizeCrowd([], 4, seq(0.1, 0.2, 0.3, 0.4));
    expect(resizeCrowd(before, 2)).toEqual(before.slice(0, 2));
    expect(resizeCrowd(before, -1)).toEqual([]);
  });
});
