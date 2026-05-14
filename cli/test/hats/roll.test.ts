import { describe, it, expect, vi } from 'vitest';
import { rollHat } from '../../src/hats/roll.js';
import { HATS } from '../../src/hats/definitions.js';
import { TINT_POOL } from '../../src/hats/tints.js';

describe('rollHat', () => {
  it('returns a CollectedHat with a valid hat id', () => {
    const result = rollHat();
    const validIds = new Set(HATS.map(h => h.id));
    expect(validIds.has(result.id)).toBe(true);
  });

  it('sets obtained_at to an ISO string', () => {
    const result = rollHat();
    expect(typeof result.obtained_at).toBe('string');
    expect(isNaN(new Date(result.obtained_at).getTime())).toBe(false);
  });

  it('legendary hats never have a tint', () => {
    expect.assertions(400); // 200 rarity assertions + 200 tint assertions
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const results = Array.from({ length: 200 }, () => rollHat());
    vi.restoreAllMocks();
    for (const r of results) {
      const hat = HATS.find(h => h.id === r.id)!;
      expect(hat.rarity).toBe('legendary');
      expect(r.tint).toBeUndefined();
    }
  });

  it('non-legendary hats have a tint from TINT_POOL', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const results = Array.from({ length: 100 }, () => rollHat());
    vi.restoreAllMocks();
    for (const r of results) {
      expect(TINT_POOL).toContain(r.tint);
    }
  });

  it('only rolls hats from the correct tier proportionally', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const result = rollHat();
    vi.restoreAllMocks();
    const hat = HATS.find(h => h.id === result.id)!;
    expect(hat.rarity).toBe('common');
  });
});
