import { describe, it, expect } from 'vitest';
import { hashSeed, mulberry32, gammaSampler } from '../src/random.js';

describe('hashSeed', () => {
  it('is stable for the same parts', () => {
    expect(hashSeed('race-1', 'u-1', 'score')).toBe(hashSeed('race-1', 'u-1', 'score'));
  });
  it('separates parts so ("ab","c") differs from ("a","bc")', () => {
    expect(hashSeed('ab', 'c')).not.toBe(hashSeed('a', 'bc'));
  });
  it('returns an unsigned 32-bit integer', () => {
    const h = hashSeed('x');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe('mulberry32', () => {
  it('draws in [0, 1) and repeats for the same seed', () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = a();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(v).toBe(b());
    }
  });
});

describe('gammaSampler', () => {
  it('has mean k for unit scale', () => {
    for (const k of [0.3, 2, 7]) {
      const g = gammaSampler(mulberry32(7));
      let sum = 0;
      for (let i = 0; i < 40_000; i++) sum += g(k);
      expect(sum / 40_000).toBeCloseTo(k, 1);
    }
  });
});
