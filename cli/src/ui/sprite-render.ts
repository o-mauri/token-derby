import type { HorseColors } from '@token-derby/shared';
import { FIXED_COLORS, type SlotTag } from './sprite.js';

export type Cell = {
  top: string | null;
  bottom: string | null;
};

export function renderSprite(
  sprite: readonly (readonly SlotTag[])[],
  colors: HorseColors,
): Cell[][] {
  const out: Cell[][] = [];
  for (let y = 0; y + 1 < sprite.length || y < sprite.length; y += 2) {
    const topRow = sprite[y];
    const bottomRow = sprite[y + 1];
    if (!topRow) break;
    const row: Cell[] = [];
    for (let x = 0; x < topRow.length; x++) {
      row.push({
        top: tagColor(topRow[x] ?? null, colors),
        bottom: tagColor(bottomRow?.[x] ?? null, colors),
      });
    }
    out.push(row);
    if (!bottomRow) break;
  }
  return out;
}

function tagColor(tag: SlotTag, colors: HorseColors): string | null {
  if (tag === null) return null;
  if (tag === 'E') return FIXED_COLORS.E;
  if (tag === 'H') return FIXED_COLORS.H;
  if (tag === 'B') return colors.body;
  if (tag === 'M') return colors.mane;
  if (tag === 'T') return colors.tail;
  if (tag === 'S') return colors.saddle;
  return null;
}
