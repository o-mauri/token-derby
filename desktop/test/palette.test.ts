import { describe, it, expect } from 'vitest';
import { SLOTS, PALETTES, nextColor, prevColor, defaultColors } from '../src/lib/palette.js';

describe('palette', () => {
  it('exposes the four colour slots', () => {
    expect(SLOTS).toEqual(['body', 'mane', 'tail', 'saddle']);
  });

  it('nextColor advances to the following swatch in the slot palette', () => {
    expect(nextColor('body', PALETTES.body[0]!)).toBe(PALETTES.body[1]);
    expect(nextColor('mane', PALETTES.mane[2]!)).toBe(PALETTES.mane[3]);
  });

  it('nextColor wraps from the last swatch back to the first', () => {
    const last = PALETTES.body[PALETTES.body.length - 1]!;
    expect(nextColor('body', last)).toBe(PALETTES.body[0]);
  });

  it('prevColor is the inverse of nextColor', () => {
    expect(prevColor('body', PALETTES.body[1]!)).toBe(PALETTES.body[0]);
    expect(prevColor('saddle', PALETTES.saddle[3]!)).toBe(PALETTES.saddle[2]);
  });

  it('prevColor wraps from the first swatch back to the last', () => {
    const first = PALETTES.tail[0]!;
    expect(prevColor('tail', first)).toBe(PALETTES.tail[PALETTES.tail.length - 1]);
  });

  it('falls back to the first swatch when the current colour is not in the palette', () => {
    expect(nextColor('body', '#unknown')).toBe(PALETTES.body[0]);
    expect(prevColor('body', '#unknown')).toBe(PALETTES.body[0]);
  });

  it('defaultColors returns a valid HorseColors using each slot\'s first swatch', () => {
    expect(defaultColors()).toEqual({
      body: PALETTES.body[0],
      mane: PALETTES.mane[0],
      tail: PALETTES.tail[0],
      saddle: PALETTES.saddle[0],
    });
  });
});
