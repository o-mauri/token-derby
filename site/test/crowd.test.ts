import { describe, it, expect } from 'vitest';
import { Window } from 'happy-dom';
import { CHEER, cheerJitter, crowdColumns, syncSpectators, TILE_PX } from '../src/render/crowd.js';

/** Deterministic stand-in for Math.random, cycling the given values. */
function seq(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

function makeBody(): HTMLElement {
  const win = new Window();
  const body = win.document.createElement('div');
  body.className = 'crowd-body';
  win.document.body.appendChild(body);
  return body as unknown as HTMLElement;
}

describe('crowdColumns', () => {
  it('counts only whole sprite tiles', () => {
    expect(crowdColumns(10 * 2 * TILE_PX, 2)).toBe(10);
    expect(crowdColumns(10 * 2 * TILE_PX + 31, 2)).toBe(10);
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

describe('syncSpectators', () => {
  it('gives each spectator its own cycle and offset', () => {
    const body = makeBody();
    syncSpectators(body, 3, seq(0, 0, 1, 0.5, 0.25, 1));
    const phases = Array.from(body.children).map((el) => [
      (el as HTMLElement).style.getPropertyValue('--cheer-duration'),
      (el as HTMLElement).style.getPropertyValue('--cheer-delay'),
    ]);
    expect(body.childElementCount).toBe(3);
    expect(new Set(phases.map((p) => p.join('/'))).size).toBe(3);
    expect(phases[0]).toEqual([`${CHEER.MIN_MS}ms`, '0ms']);
  });

  it('adds and removes tiles to reach the requested count', () => {
    const body = makeBody();
    syncSpectators(body, 5);
    expect(body.childElementCount).toBe(5);
    syncSpectators(body, 2);
    expect(body.childElementCount).toBe(2);
    syncSpectators(body, 0);
    expect(body.childElementCount).toBe(0);
  });

  it('leaves existing spectators untouched so a resize does not re-roll the crowd', () => {
    const body = makeBody();
    syncSpectators(body, 2);
    const before = Array.from(body.children).map((el) => (el as HTMLElement).style.cssText);
    syncSpectators(body, 4);
    const after = Array.from(body.children).map((el) => (el as HTMLElement).style.cssText);
    expect(after.slice(0, 2)).toEqual(before);
  });
});
