import { describe, it, expect } from 'vitest';
import { recordAttempt, CLAIM_LOOKUP_LIMIT, WINDOW_SECONDS } from '../../src/db/rate-limits.js';

const uid = () => `u-${Math.random().toString(36).slice(2)}`;

describe('recordAttempt', () => {
  it('counts up from one', async () => {
    const u = uid();
    expect(await recordAttempt('claim', u)).toBe(1);
    expect(await recordAttempt('claim', u)).toBe(2);
    expect(await recordAttempt('claim', u)).toBe(3);
  });

  it('exposes a limit of ten per hour', () => {
    expect(CLAIM_LOOKUP_LIMIT).toBe(10);
    expect(WINDOW_SECONDS).toBe(3600);
  });

  it('crosses the limit on the eleventh attempt', async () => {
    const u = uid();
    let count = 0;
    for (let i = 0; i < 11; i++) count = await recordAttempt('claim', u);
    expect(count).toBe(11);
    expect(count > CLAIM_LOOKUP_LIMIT).toBe(true);
  });

  it('resets in the next window', async () => {
    const u = uid();
    const now = 1_800_000_000_000;
    for (let i = 0; i < 10; i++) await recordAttempt('claim', u, now);
    expect(await recordAttempt('claim', u, now + WINDOW_SECONDS * 1000)).toBe(1);
  });

  it('shares one counter across sub-hour boundaries within the same window', async () => {
    const u = uid();
    // 1_800_000_000_000 is 00:00:00 on an exact hour boundary; each offset
    // below stays inside that same hour while crossing smaller boundaries.
    const base = 1_800_000_000_000;
    expect(await recordAttempt('claim', u, base)).toBe(1);
    expect(await recordAttempt('claim', u, base + 61_000)).toBe(2);
    expect(await recordAttempt('claim', u, base + 1_799_000)).toBe(3);
    expect(await recordAttempt('claim', u, base + 1_800_000)).toBe(4);
    expect(await recordAttempt('claim', u, base + 3_599_000)).toBe(5);
  });

  it('keys per subject so one user cannot throttle another', async () => {
    const a = uid();
    const b = uid();
    for (let i = 0; i < 10; i++) await recordAttempt('claim', a);
    expect(await recordAttempt('claim', b)).toBe(1);
  });

  it('keys per bucket', async () => {
    const u = uid();
    await recordAttempt('claim', u);
    expect(await recordAttempt('other', u)).toBe(1);
  });
});
