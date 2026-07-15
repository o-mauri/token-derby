import { describe, it, expect } from 'vitest';
import { GRID, SPRITE_WIDTH, SPRITE_HEIGHT, HOOF_COLOR } from '../src/sprite-grid.js';

describe('sprite-grid', () => {
  it('is 32x24 with a hoof colour', () => {
    expect(SPRITE_WIDTH).toBe(32);
    expect(SPRITE_HEIGHT).toBe(24);
    expect(GRID.length).toBe(24);
    expect(GRID[0]!.length).toBe(32);
    expect(HOOF_COLOR).toBe('#1F1108');
  });
});
