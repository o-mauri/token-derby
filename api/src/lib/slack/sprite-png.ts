import { PNG } from 'pngjs';
import { GRID, SPRITE_WIDTH, SPRITE_HEIGHT, HOOF_COLOR, type SlotTag } from '@token-derby/shared';
import type { HorseColors } from '@token-derby/shared';

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function parseHex(hex: string): [number, number, number] {
  const m = HEX_RE.exec(hex);
  if (!m) throw new Error(`invalid hex colour "${hex}"`);
  const v = parseInt(m[1]!, 16);
  return [(v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF];
}

function rgbForTag(tag: SlotTag, colors: HorseColors): [number, number, number, number] {
  switch (tag) {
    case 'B': return [...parseHex(colors.body),   0xFF];
    case 'M': return [...parseHex(colors.mane),   0xFF];
    case 'T': return [...parseHex(colors.tail),   0xFF];
    case 'S': return [...parseHex(colors.saddle), 0xFF];
    case 'H': return [...parseHex(HOOF_COLOR),    0xFF];
    case null: return [0, 0, 0, 0];
  }
}

export function renderHorsePng(colors: HorseColors, scale: number = 8): Buffer {
  if (!Number.isInteger(scale) || scale < 1) throw new Error('scale must be a positive integer');

  const width = SPRITE_WIDTH * scale;
  const height = SPRITE_HEIGHT * scale;
  const png = new PNG({ width, height });

  for (let gy = 0; gy < SPRITE_HEIGHT; gy++) {
    const row = GRID[gy]!;
    for (let gx = 0; gx < SPRITE_WIDTH; gx++) {
      const [r, g, b, a] = rgbForTag(row[gx]!, colors);
      for (let dy = 0; dy < scale; dy++) {
        const py = gy * scale + dy;
        for (let dx = 0; dx < scale; dx++) {
          const px = gx * scale + dx;
          const idx = (py * width + px) * 4;
          png.data[idx]     = r;
          png.data[idx + 1] = g;
          png.data[idx + 2] = b;
          png.data[idx + 3] = a;
        }
      }
    }
  }

  return PNG.sync.write(png);
}
