import { describe, it, expect } from 'vitest';
import { HATS, hatById } from '../src/hats.js';
import { isAnimatedHat, variantCount, HAT_CHANNELS } from '../src/hat-shape.js';
import type { Hat } from '../src/types.js';

describe('HATS catalog', () => {
  it('contains exactly 46 hats', () => {
    expect(HATS).toHaveLength(46);
  });

  it('has the expected rarity counts', () => {
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0, limited: 0 };
    for (const h of HATS) counts[h.rarity]++;
    expect(counts).toEqual({ common: 18, rare: 10, epic: 6, legendary: 6, limited: 6 });
  });

  it('every hat is 11×10 with width 11', () => {
    for (const h of HATS) {
      expect(h.width).toBe(11);
      expect(h.rows).toHaveLength(10);
      for (const row of h.rows) expect(row).toHaveLength(11);
    }
  });

  it('variant hats have variants[] with ≥ 1 entry', () => {
    for (const h of HATS) {
      if (isAnimatedHat(h)) continue;
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
    expect(HATS.filter(h => !h.rollable).map(h => h.id)).toEqual([
      'contributor_cap',
      'bearskin', 'roundel_cap', 'union_topper', 'crown_jewels', 'black_cab', 'london_bus',
    ]);
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

describe('limited edition tier', () => {
  it('is absent from the rollable pool', () => {
    for (const hat of HATS.filter(h => h.rarity === 'limited')) {
      expect(hat.rollable, `${hat.id} is limited but rollable`).toBe(false);
    }
  });

  it('accepts either shape for a limited hat', () => {
    // No limited hats ship yet; this asserts the union admits both forms.
    const animated: Hat = {
      id: 'le_animated', name: 'LE Animated', rarity: 'limited', width: 11, anchor_x: 23,
      rows: Array(10).fill('...........'),
      colors: { A: '#f472b6' },
      animation: { type: 'cycle', frames: ['#f472b6', '#ec4899'], fps: 6 },
      rollable: false,
    };
    const varianted: Hat = {
      id: 'le_variants', name: 'LE Variants', rarity: 'limited', width: 11, anchor_x: 23,
      rows: Array(10).fill('...........'),
      variants: [{ A: '#f472b6' }, { A: '#ec4899' }],
      rollable: false,
    };
    expect(isAnimatedHat(animated)).toBe(true);
    expect(isAnimatedHat(varianted)).toBe(false);
    expect(variantCount(varianted)).toBe(2);
  });
});

describe('row characters resolve to a declared colour', () => {
  const paletteOf = (h: Hat) => (isAnimatedHat(h) ? [h.colors] : h.variants);

  it('uses only "." or a declared channel in every row', () => {
    for (const hat of HATS) {
      for (const row of hat.rows) {
        for (const ch of row) {
          if (ch === '.') continue;
          expect(HAT_CHANNELS as readonly string[], `${hat.id} uses unknown channel '${ch}'`)
            .toContain(ch);
        }
      }
    }
  });

  it('declares every channel it paints with, in every variant', () => {
    for (const hat of HATS) {
      const used = new Set([...hat.rows.join('')].filter(c => c !== '.'));
      for (const [i, palette] of paletteOf(hat).entries()) {
        for (const ch of used) {
          const c = (palette as Record<string, string | undefined>)[ch];
          expect(c, `${hat.id} variant ${i} paints '${ch}' but declares no colour for it`)
            .toMatch(/^#[0-9a-fA-F]{6}$/);
        }
      }
    }
  });
});

describe('limited edition roster', () => {
  const limited = HATS.filter(h => h.rarity === 'limited');

  it('is the London series, every one claim-only', () => {
    expect(limited.map(h => h.id)).toEqual([
      'bearskin', 'roundel_cap', 'union_topper', 'crown_jewels', 'black_cab', 'london_bus',
    ]);
    for (const h of limited) expect(h.rollable, `${h.id} must not be rollable`).toBe(false);
  });

  it('gives each one a single colourway, so a limited hat is one collectible', () => {
    for (const h of limited) {
      if (isAnimatedHat(h)) continue;
      expect(h.variants.length, `${h.id} has ${h.variants.length} variants`).toBe(1);
    }
  });
});
