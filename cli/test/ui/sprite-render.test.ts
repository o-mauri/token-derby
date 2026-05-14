import { describe, it, expect } from 'vitest';
import { renderSprite, type Cell } from '../../src/ui/sprite-render.js';
import { MAIN_SPRITE, MINI_SPRITE } from '../../src/ui/sprite.js';
import { defaultColors } from '../../src/ui/palette.js';

describe('renderSprite', () => {
  it('produces height/2 rows of width cells', () => {
    const colors = defaultColors();
    const grid = renderSprite(MAIN_SPRITE, colors);
    expect(grid).toHaveLength(12);
    expect(grid[0]!).toHaveLength(32);
  });

  it('renders mini sprite as 2 rows of 8 cells', () => {
    const grid = renderSprite(MINI_SPRITE, defaultColors());
    expect(grid).toHaveLength(2);
    expect(grid[0]!).toHaveLength(8);
  });

  it('a body pixel above transparent yields top=body, bottom=null', () => {
    const tiny = [
      ['B', null],
      [null, null],
    ] as const;
    const colors = { body: '#FF0000', mane: '#0000FF', tail: '#000', saddle: '#000' };
    const grid = renderSprite(tiny as any, colors as any);
    const cell = grid[0]![0]!;
    expect(cell.top).toBe('#FF0000');
    expect(cell.bottom).toBe(null);
  });

  it('a body pixel above a mane pixel yields top=body, bottom=mane', () => {
    const tiny = [['B'], ['M']] as const;
    const colors = { body: '#FF0000', mane: '#00FF00', tail: '#000', saddle: '#000' };
    const grid = renderSprite(tiny as any, colors as any);
    expect(grid[0]![0]).toEqual<Cell>({ top: '#FF0000', bottom: '#00FF00' });
  });

  it('uses the fixed eye color regardless of input colors', () => {
    const tiny = [['E'], [null]] as const;
    const grid = renderSprite(tiny as any, defaultColors());
    expect(grid[0]![0]?.top).toBe('#000000');
  });

  it('uses the fixed hoof color', () => {
    const tiny = [[null], ['H']] as const;
    const grid = renderSprite(tiny as any, defaultColors());
    expect(grid[0]![0]?.bottom).toBe('#1F1108');
  });

  it('ignores the bottom row of a sprite with odd height', () => {
    const tiny = [['B'], ['M'], ['T']] as const;
    const colors = { body: '#FF0000', mane: '#00FF00', tail: '#0000FF', saddle: '#000' };
    const grid = renderSprite(tiny as any, colors as any);
    expect(grid).toHaveLength(2);
    expect(grid[1]![0]).toEqual<Cell>({ top: '#0000FF', bottom: null });
  });

  it.todo('resolves A slot to the hat primary colour');
});
