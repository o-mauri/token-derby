import { describe, it, expect } from 'vitest';
import { PNG } from 'pngjs';
import { renderHorsePng } from '../../../src/lib/slack/sprite-png.js';

const COLORS = { body: '#FF0000', mane: '#000000', tail: '#000000', saddle: '#CC0000' };

describe('renderHorsePng', () => {
  it('renders a 32x24 sprite at the given scale', () => {
    const buf = renderHorsePng(COLORS, 4);
    const png = PNG.sync.read(buf);
    expect(png.width).toBe(32 * 4);
    expect(png.height).toBe(24 * 4);
  });

  it('rejects a bad scale and bad hex', () => {
    expect(() => renderHorsePng(COLORS, 0)).toThrow();
    expect(() => renderHorsePng({ ...COLORS, body: 'red' }, 4)).toThrow();
  });
});
