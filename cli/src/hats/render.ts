import type { Hat, HorseColors } from '@token-derby/shared';
import { FIXED_COLORS, type SlotTag } from '../ui/sprite.js';

export type HatGrid = {
  /** 2D array of hex colours (or null for transparent). Width = canvas width, height = HORSE_H + extension */
  grid: (string | null)[][];
  /** Leftmost x-coordinate in horse-coords (≤ 0). The horse starts at grid column = -offsetX. */
  offsetX: number;
};

/**
 * Compose a horse + hat into a single coloured grid.
 *
 * Overlap rule: the hat's bottom 4 rows overlap horse rows 0..3, so the hat
 * sits flush on the flat head (y=4), covering the mane. The canvas grows
 * vertically by `max(0, hat.rows.length - 4)` and horizontally to fit any
 * hat overhang past the 32-wide horse sprite.
 *
 * Pure function — no side effects, deterministic given inputs.
 */
export function composeHatGrid(
  baseSprite: readonly (readonly SlotTag[])[],
  hat: Hat,
  variantIdx: number,
  horseColors: HorseColors,
): HatGrid {
  const horseH = baseSprite.length;
  const horseW = baseSprite[0]?.length ?? 0;
  const hatH = hat.rows.length;
  const hatW = hat.width;
  const ext = Math.max(0, hatH - 4);

  // Canvas dimensions accommodate hat overhang.
  const canvasLeft = Math.min(0, hat.anchor_x);
  const canvasRight = Math.max(horseW, hat.anchor_x + hatW);
  const canvasW = canvasRight - canvasLeft;
  const horseOffsetX = -canvasLeft;

  const grid: (string | null)[][] = Array.from(
    { length: horseH + ext },
    () => Array(canvasW).fill(null),
  );

  // Paint horse first, hat second. The hat overlays the horse in the 4-row
  // overlap zone (grid rows ext..ext+3 = horse rows 0..3) — this is exactly
  // the point of the overlap rule: the hat covers the top of the mane and
  // sits visibly on the flat head. Above the horse (grid rows 0..ext-1) only
  // the hat is painted; below (the rest of the body) only the horse is.
  for (let y = 0; y < horseH; y++) {
    for (let x = 0; x < horseW; x++) {
      const tag = baseSprite[y]![x];
      if (tag === null) continue;
      grid[y + ext]![x + horseOffsetX] = tagToColor(tag, horseColors);
    }
  }

  const hatColors = hatColorsFor(hat, variantIdx);
  for (let y = 0; y < hatH; y++) {
    const row = hat.rows[y]!;
    for (let x = 0; x < hatW; x++) {
      const ch = row[x];
      if (ch === '.' || ch === undefined) continue;
      const gx = hat.anchor_x + x + horseOffsetX;
      if (gx < 0 || gx >= canvasW) continue;
      const color = ch === 'A' ? hatColors.A : (hatColors.Q ?? hatColors.A);
      grid[y]![gx] = color;
    }
  }

  return { grid, offsetX: canvasLeft };
}

function tagToColor(tag: Exclude<SlotTag, null>, c: HorseColors): string {
  switch (tag) {
    case 'B': return c.body;
    case 'M': return c.mane;
    case 'T': return c.tail;
    case 'S': return c.saddle;
    case 'E': return FIXED_COLORS.E;
    case 'H': return FIXED_COLORS.H;
  }
}

function hatColorsFor(hat: Hat, variantIdx: number): { A: string; Q?: string } {
  if (hat.rarity === 'legendary') return hat.colors;
  return hat.variants[variantIdx] ?? hat.variants[0]!;
}
