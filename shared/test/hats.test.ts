import { describe, it, expect } from 'vitest';
import { HATS, hatById } from '../src/hats.js';

describe('HATS catalog', () => {
  it('contains exactly 40 hats', () => {
    expect(HATS).toHaveLength(40);
  });

  it('has the expected rarity counts', () => {
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (const h of HATS) counts[h.rarity]++;
    expect(counts).toEqual({ common: 18, rare: 10, epic: 6, legendary: 6 });
  });

  it('every hat is 11×10 with width 11', () => {
    for (const h of HATS) {
      expect(h.width).toBe(11);
      expect(h.rows).toHaveLength(10);
      for (const row of h.rows) expect(row).toHaveLength(11);
    }
  });

  it('non-legendary hats have variants[] with ≥ 1 entry', () => {
    for (const h of HATS) {
      if (h.rarity === 'legendary') continue;
      expect(h.variants.length).toBeGreaterThanOrEqual(1);
      for (const v of h.variants) expect(v.A).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('legendary hats have colors + animation', () => {
    for (const h of HATS) {
      if (h.rarity !== 'legendary') continue;
      expect(h.colors.A).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(h.animation.frames.length).toBeGreaterThan(0);
      expect(h.animation.fps).toBeGreaterThan(0);
    }
  });

  it('hat ids are unique', () => {
    const ids = HATS.map(h => h.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hatById returns the hat for a known id', () => {
    expect(hatById('flat_cap')?.name).toBe('Flat Cap');
  });

  it('hatById returns undefined for an unknown id', () => {
    expect(hatById('not_a_hat')).toBeUndefined();
  });

  it('every hat declares whether it is rollable', () => {
    for (const h of HATS) {
      expect(typeof h.rollable, `${h.id} missing rollable`).toBe('boolean');
    }
  });

  // Pins the claim-only roster. Adding another exclusive hat is expected to trip
  // this — when it does, also revisit the site EXCLUSIVE badge and the admin
  // (exclusive) label so both surfaces are checked against real data.
  it('pins exactly which hats are claim-only', () => {
    expect(HATS.filter(h => !h.rollable).map(h => h.id)).toEqual(['contributor_cap']);
  });

  it('the Contributor Cap is a claim-only animated legendary', () => {
    const hat = hatById('contributor_cap');
    expect(hat).toBeDefined();
    expect(hat!.rarity).toBe('legendary');
    expect(hat!.rollable).toBe(false);
    if (hat!.rarity !== 'legendary') throw new Error('unreachable');
    // Q is the static crown gold; keeping it out of the cycling A frames stops
    // the logo merging into the crown mid-cycle.
    expect(hat!.animation.frames).not.toContain(hat!.colors.Q);
    expect(hat!.animation.frames.length).toBeGreaterThan(1);
  });
});
