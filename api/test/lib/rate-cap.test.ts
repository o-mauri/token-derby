import { describe, it, expect } from 'vitest';
import { clampDelta } from '../../src/lib/rate-cap.js';

const RATE = 500;

describe('clampDelta', () => {
  it('passes a delta below the rate ceiling unchanged', () => {
    expect(clampDelta({ delta: 1_500, elapsedMs: 60_000, max_rate_per_second: RATE })).toBe(1_500);
  });

  it('clamps an excessive delta to rate × elapsed', () => {
    expect(clampDelta({ delta: 9_999_999, elapsedMs: 60_000, max_rate_per_second: RATE })).toBe(30_000);
  });

  it('treats a negative delta as zero', () => {
    expect(clampDelta({ delta: -5, elapsedMs: 60_000, max_rate_per_second: RATE })).toBe(0);
  });

  it('treats zero/negative elapsed as zero ceiling', () => {
    expect(clampDelta({ delta: 2_000, elapsedMs: 0, max_rate_per_second: RATE })).toBe(0);
    expect(clampDelta({ delta: 2_000, elapsedMs: -10, max_rate_per_second: RATE })).toBe(0);
  });

  it('falls back to the 7,500/s default with no override and no env', () => {
    const prev = process.env.TOKEN_DERBY_MAX_RATE;   // the suite sets one globally
    delete process.env.TOKEN_DERBY_MAX_RATE;
    try {
      // ceiling = 7_500 × 60 = 450_000
      expect(clampDelta({ delta: 9_999_999, elapsedMs: 60_000 })).toBe(450_000);
    } finally {
      if (prev !== undefined) process.env.TOKEN_DERBY_MAX_RATE = prev;
    }
  });

  it('uses TOKEN_DERBY_MAX_RATE env when no override is passed', () => {
    const prev = process.env.TOKEN_DERBY_MAX_RATE;
    process.env.TOKEN_DERBY_MAX_RATE = '50';
    try {
      // ceiling = 50 × 10 = 500
      expect(clampDelta({ delta: 10_000, elapsedMs: 10_000 })).toBe(500);
    } finally {
      if (prev === undefined) delete process.env.TOKEN_DERBY_MAX_RATE;
      else process.env.TOKEN_DERBY_MAX_RATE = prev;
    }
  });
});
