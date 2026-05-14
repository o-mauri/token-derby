import { describe, it, expect } from 'vitest';
import { computeAutoScrollY, BOUNCE } from '../src/render/autoscroll.js';

const { HOLD_MS, SCROLL_MS } = BOUNCE;
const CYCLE = 2 * HOLD_MS + 2 * SCROLL_MS;

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
