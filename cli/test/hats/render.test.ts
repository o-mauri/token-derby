import { describe, it, expect } from 'vitest';
import { composeHatGrid } from '../../src/hats/render.js';
import { MAIN_SPRITE } from '../../src/ui/sprite.js';
import { hatById } from '@token-derby/shared';

const HORSE_COLORS = { body: '#A0522D', mane: '#2F1B0C', tail: '#2F1B0C', saddle: '#8B4513' };

describe('composeHatGrid', () => {
  it('returns a grid taller than the base sprite (extension = hat rows - 4)', () => {
    const hat = hatById('flat_cap')!;
    if (hat.rarity === 'legendary') throw new Error('test misconfigured');
    const { grid } = composeHatGrid(MAIN_SPRITE, hat, 0, HORSE_COLORS);
    const ext = Math.max(0, hat.rows.length - 4);
    expect(grid.length).toBe(MAIN_SPRITE.length + ext);
  });

  it('widens the canvas to fit hat overhang past the 32-wide horse sprite', () => {
    const hat = hatById('flat_cap')!;
    if (hat.rarity === 'legendary') throw new Error('test misconfigured');
    const { grid, offsetX } = composeHatGrid(MAIN_SPRITE, hat, 0, HORSE_COLORS);
    const expectedW = Math.max(32, hat.anchor_x + hat.width) - Math.min(0, hat.anchor_x);
    expect(grid[0]!.length).toBe(expectedW);
    expect(offsetX).toBe(Math.min(0, hat.anchor_x));
  });

  it('uses the requested variant for hat A pixels', () => {
    const hat = hatById('flat_cap')!;
    if (hat.rarity === 'legendary') throw new Error('test misconfigured');
    const v0 = hat.variants[0]!;
    const { grid, offsetX } = composeHatGrid(MAIN_SPRITE, hat, 0, HORSE_COLORS);
    // Find any 'A' in flat_cap and verify the corresponding grid cell uses v0.A.
    for (let y = 0; y < hat.rows.length; y++) {
      const row = hat.rows[y]!;
      for (let x = 0; x < hat.width; x++) {
        if (row[x] !== 'A') continue;
        const gridY = y;
        const gridX = hat.anchor_x + x - offsetX;
        if (gridX >= 0 && gridX < grid[0]!.length) {
          expect(grid[gridY]![gridX]).toBe(v0.A);
          return;
        }
      }
    }
    throw new Error('no A pixel found in flat_cap to test');
  });

  it('handles legendary hats by using hat.colors instead of variants', () => {
    const hat = hatById('rainbow_crown')!;
    expect(hat.rarity).toBe('legendary');
    const { grid } = composeHatGrid(MAIN_SPRITE, hat, 0, HORSE_COLORS);
    expect(grid).toBeDefined();
    expect(grid.length).toBeGreaterThan(0);
  });

  it('hat overlays the horse — mane pixels covered by hat in the overlap zone', () => {
    // flat_cap row 8 is `..AAAAAAA..` (all A from x=2..8), which lands at horse cols 25..31
    // when anchor_x=23. Horse row 2 has mane `MMM` at cols 26..28. After compositing,
    // those mane cells should be hat color (not mane color) because the hat overlays.
    const hat = hatById('flat_cap')!;
    if (hat.rarity === 'legendary') throw new Error('test misconfigured');
    const v0 = hat.variants[0]!;
    const { grid, offsetX } = composeHatGrid(MAIN_SPRITE, hat, 0, HORSE_COLORS);
    const ext = Math.max(0, hat.rows.length - 4);
    // Horse row 2 = grid row (2 + ext); col 26 (mane M).
    const gridY = 2 + ext;
    const gridX = 26 - offsetX;
    expect(grid[gridY]![gridX]).toBe(v0.A);
  });

  it('horse pixels are visible outside the overlap zone (e.g. the body proper)', () => {
    // Horse row 10 has body pixels far below the hat overlap zone.
    const hat = hatById('flat_cap')!;
    const { grid, offsetX } = composeHatGrid(MAIN_SPRITE, hat, 0, HORSE_COLORS);
    const ext = Math.max(0, hat.rows.length - 4);
    const horseRow = 10;
    for (let x = 0; x < 32; x++) {
      const tag = MAIN_SPRITE[horseRow]![x];
      if (tag === 'B') {
        const gridY = horseRow + ext;
        const gridX = x - offsetX;
        expect(grid[gridY]![gridX]).toBe(HORSE_COLORS.body);
        return;
      }
    }
    throw new Error('no body pixel found at horse row 10');
  });
});
