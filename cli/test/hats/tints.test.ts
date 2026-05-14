import { describe, it, expect } from 'vitest';
import { TINTS, TINT_POOL } from '../../src/hats/tints.js';

describe('tints', () => {
  it('has 16 hex colours plus the natural sentinel', () => {
    expect(TINTS).toHaveLength(16);
    expect(TINT_POOL).toHaveLength(17);
  });

  it('natural sentinel is undefined', () => {
    expect(TINT_POOL.some(t => t === undefined)).toBe(true);
  });

  it('all non-natural entries are valid hex colours', () => {
    for (const t of TINTS) {
      expect(t).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
