import { describe, it, expect } from 'vitest';
import { mapWithConcurrency, SCAN_CONCURRENCY } from '../src/pool.js';

describe('mapWithConcurrency', () => {
  it('returns results in input order, not completion order', async () => {
    const delays = [30, 1, 20, 2, 10];
    const out = await mapWithConcurrency(delays, 3, async (ms, i) => {
      await new Promise(r => setTimeout(r, ms));
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4]);
  });

  it('never runs more than the limit concurrently', async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(r => setTimeout(r, 1));
      active -= 1;
    });
    expect(peak).toBe(3);
  });

  it('still runs every item when there are fewer items than the limit', async () => {
    const out = await mapWithConcurrency([1, 2], 8, async n => n * 10);
    expect(out).toEqual([10, 20]);
  });

  it('propagates a failure instead of silently dropping the item', async () => {
    // transcripts.ts is fail-loud: a read error must not become a partial sum.
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error('EISDIR');
        return n;
      }),
    ).rejects.toThrow('EISDIR');
  });

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });

  it('defaults to a limit in the 8-16 range', () => {
    expect(SCAN_CONCURRENCY).toBeGreaterThanOrEqual(8);
    expect(SCAN_CONCURRENCY).toBeLessThanOrEqual(16);
  });
});
