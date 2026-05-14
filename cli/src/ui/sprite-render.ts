import type { HorseColors, Hat } from '@token-derby/shared';
import { FIXED_COLORS, type SlotTag } from './sprite.js';

export type Cell = {
  top: string | null;
  bottom: string | null;
};

export type HatOpts = {
  hat: Hat;
  tint?: string;
  frameColor?: string;
};

export function renderSprite(
  sprite: readonly (readonly SlotTag[])[],
  colors: HorseColors,
  hatOpts?: HatOpts,
): Cell[][] {
  const spriteWidth = sprite[0]?.length ?? 32;
  const hatColors = hatOpts
    ? {
        A: hatOpts.frameColor ?? hatOpts.tint ?? hatOpts.hat.colors.A,
        Q: hatOpts.hat.colors.Q,
      }
    : undefined;

  const rows = hatOpts
    ? [...buildHatRows(hatOpts.hat, spriteWidth), ...sprite]
    : sprite;

  const out: Cell[][] = [];
  for (let y = 0; y + 1 <= rows.length; y += 2) {
    const topRow = rows[y];
    const bottomRow = rows[y + 1];
    if (!topRow) break;
    const row: Cell[] = [];
    for (let x = 0; x < topRow.length; x++) {
      row.push({
        top: tagColor(topRow[x] ?? null, colors, hatColors),
        bottom: tagColor(bottomRow?.[x] ?? null, colors, hatColors),
      });
    }
    out.push(row);
    if (!bottomRow) break;
  }
  return out;
}

function buildHatRows(hat: Hat, spriteWidth: number): readonly (readonly SlotTag[])[] {
  return hat.rows.map(rowStr => {
    const row: SlotTag[] = Array<SlotTag>(spriteWidth).fill(null);
    for (let i = 0; i < hat.width; i++) {
      const ch = rowStr[i];
      row[hat.anchor_x + i] = ch === 'A' ? 'A' : ch === 'Q' ? 'Q' : null;
    }
    return row;
  });
}

function tagColor(
  tag: SlotTag,
  colors: HorseColors,
  hatColors?: { A: string; Q?: string },
): string | null {
  if (tag === null) return null;
  if (tag === 'E') return FIXED_COLORS.E;
  if (tag === 'H') return FIXED_COLORS.H;
  if (tag === 'B') return colors.body;
  if (tag === 'M') return colors.mane;
  if (tag === 'T') return colors.tail;
  if (tag === 'S') return colors.saddle;
  if (tag === 'A') return hatColors?.A ?? null;
  if (tag === 'Q') return hatColors?.Q ?? null;
  return null;
}
