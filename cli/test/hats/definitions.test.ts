import { describe, it, expect } from 'vitest';
import { HATS, hatById } from '../../src/hats/definitions.js';

describe('hat definitions', () => {
  it('has exactly 50 hats', () => {
    expect(HATS).toHaveLength(50);
  });

  it('all ids are unique', () => {
    const ids = HATS.map(h => h.id);
    expect(new Set(ids).size).toBe(50);
  });

  it('each tier has the right count', () => {
    const byRarity = (r: string) => HATS.filter(h => h.rarity === r).length;
    expect(byRarity('common')).toBe(25);
    expect(byRarity('rare')).toBe(13);
    expect(byRarity('epic')).toBe(7);
    expect(byRarity('legendary')).toBe(5);
  });

  it('every row has the correct width', () => {
    for (const hat of HATS) {
      for (const row of hat.rows) {
        expect(row.length).toBe(hat.width);
      }
    }
  });

  it('row count is even on every hat', () => {
    for (const hat of HATS) {
      expect(hat.rows.length % 2).toBe(0);
    }
  });

  it('only A, Q, and . chars appear in rows', () => {
    for (const hat of HATS) {
      for (const row of hat.rows) {
        expect(row).toMatch(/^[AQ.]+$/);
      }
    }
  });

  it('only legendary hats have animation', () => {
    for (const hat of HATS) {
      if (hat.rarity === 'legendary') expect(hat.animation).toBeDefined();
      else expect(hat.animation).toBeUndefined();
    }
  });

  it('hatById returns the right hat', () => {
    expect(hatById('flat_cap')?.name).toBe('Flat Cap');
    expect(hatById('no_such')).toBeUndefined();
  });
});
