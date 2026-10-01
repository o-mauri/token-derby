import { describe, it, expect } from 'vitest';
import { isAnimatedHat, variantCount, hatColors, channelColor, HAT_CHANNELS } from '../src/hat-shape.js';
import { HATS } from '../src/hats.js';

const ANIMATED = HATS.find(h => 'animation' in h)!;
const VARIANT = HATS.find(h => 'variants' in h)!;

describe('isAnimatedHat', () => {
  it('is true for a hat carrying an animation', () => {
    expect(isAnimatedHat(ANIMATED)).toBe(true);
  });

  it('is false for a hat carrying a variant list', () => {
    expect(isAnimatedHat(VARIANT)).toBe(false);
  });

  it('classifies every catalog hat as exactly one shape', () => {
    for (const hat of HATS) {
      const animated = 'animation' in hat;
      const variants = 'variants' in hat;
      expect(animated !== variants, `${hat.id} is both or neither shape`).toBe(true);
      expect(isAnimatedHat(hat)).toBe(animated);
    }
  });
});

describe('variantCount', () => {
  it('reports one collectible for an animated hat', () => {
    expect(variantCount(ANIMATED)).toBe(1);
  });

  it('reports the variant list length for a variant hat', () => {
    expect(variantCount(VARIANT)).toBe(VARIANT.variants.length);
  });

  it('never reports zero for a catalog hat', () => {
    for (const hat of HATS) {
      expect(variantCount(hat), `${hat.id} has no collectibles`).toBeGreaterThan(0);
    }
  });
});

describe('hatColors', () => {
  it('returns the fixed palette for an animated hat, ignoring the index', () => {
    expect(hatColors(ANIMATED, 3)).toBe(ANIMATED.colors);
  });

  it('returns the indexed variant for a variant hat', () => {
    expect(hatColors(VARIANT, 0)).toBe(VARIANT.variants[0]);
  });

  it('defaults to the first variant when no index is given', () => {
    expect(hatColors(VARIANT)).toBe(VARIANT.variants[0]);
  });

  it('falls back to the first variant for an out-of-range index', () => {
    expect(hatColors(VARIANT, 999)).toBe(VARIANT.variants[0]);
  });
});

describe('channelColor', () => {
  const v = { A: '#111111', Q: '#222222', C: '#333333', D: '#444444', F: '#555555' };

  it('resolves every declared channel', () => {
    expect(channelColor(v, 'A')).toBe('#111111');
    expect(channelColor(v, 'Q')).toBe('#222222');
    expect(channelColor(v, 'C')).toBe('#333333');
    expect(channelColor(v, 'D')).toBe('#444444');
    expect(channelColor(v, 'F')).toBe('#555555');
  });

  it('falls back to A for a channel the variant does not declare', () => {
    expect(channelColor({ A: '#111111' }, 'D')).toBe('#111111');
  });

  it('falls back to A for a character that is not a channel at all', () => {
    expect(channelColor(v, 'Z')).toBe('#111111');
  });
});

describe('HAT_CHANNELS', () => {
  it('caps the palette at five channels, A first', () => {
    expect(HAT_CHANNELS).toEqual(['A', 'Q', 'C', 'D', 'F']);
  });

  it('never collides with a horse sprite tag', () => {
    // Hat rows and horse rows are composited onto one grid; reusing a horse
    // tag as a hat channel would make the art strings ambiguous to read.
    for (const t of ['B', 'M', 'T', 'S', 'E', 'H']) {
      expect(HAT_CHANNELS).not.toContain(t);
    }
  });
});
