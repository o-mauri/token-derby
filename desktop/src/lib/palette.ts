// Ported verbatim from cli/src/ui/palette.ts — same slots, swatches, and
// cycling behaviour so a horse looks identical whether coloured from the CLI
// or the desktop app.
import type { HorseColors } from '@token-derby/shared';

export type Slot = keyof HorseColors;

export const SLOTS: readonly Slot[] = ['body', 'mane', 'tail', 'saddle'] as const;

export const PALETTES: Record<Slot, readonly string[]> = {
  body: [
    '#8B4513', '#A0522D', '#D2691E', '#CD853F', '#DEB887', '#F5DEB3',
    '#FFFFFF', '#000000', '#4A2C2A', '#5D3A1A', '#704214', '#9C5919',
    '#B87333', '#E5B783', '#F0E1C9', '#2F1B0C',
  ],
  mane: [
    '#000000', '#1C1C1C', '#2F1B0C', '#4A2C2A', '#5D3A1A', '#8B4513',
    '#FFFFFF', '#F5F5DC', '#DEB887', '#CD853F', '#FF4500', '#B22222',
    '#191970', '#4B0082', '#2E8B57', '#FFD700',
  ],
  tail: [
    '#000000', '#1C1C1C', '#2F1B0C', '#4A2C2A', '#5D3A1A', '#8B4513',
    '#FFFFFF', '#F5F5DC', '#DEB887', '#CD853F', '#FF4500', '#B22222',
    '#191970', '#4B0082', '#2E8B57', '#FFD700',
  ],
  saddle: [
    '#C0392B', '#922B21', '#7B241C', '#641E16', '#1F618D', '#21618C',
    '#1B4F72', '#0E6655', '#117A65', '#196F3D', '#7D6608', '#9A7D0A',
    '#6E2C00', '#4D5656', '#212F3D', '#000000',
  ],
};

export function nextColor(slot: Slot, current: string): string {
  const palette = PALETTES[slot];
  const idx = palette.indexOf(current);
  return palette[(idx + 1 + palette.length) % palette.length] ?? palette[0]!;
}

export function prevColor(slot: Slot, current: string): string {
  const palette = PALETTES[slot];
  const idx = palette.indexOf(current);
  if (idx < 0) return palette[0]!;
  return palette[(idx - 1 + palette.length) % palette.length]!;
}

export function defaultColors(): HorseColors {
  return {
    body: PALETTES.body[0]!,
    mane: PALETTES.mane[0]!,
    tail: PALETTES.tail[0]!,
    saddle: PALETTES.saddle[0]!,
  };
}
