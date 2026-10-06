import { HATS, type Hat, type HatRarity, type HorseColors, variantCount } from '@token-derby/shared';

export type Palette = { readonly key: string; readonly name: string; readonly colors: HorseColors };

// The old catalog's five horses, colours unchanged; Roan keeps the old 'appaloosa' colours.
export const PALETTES: readonly Palette[] = [
  { key: 'chestnut', name: 'Chestnut', colors: { body: '#A0522D', mane: '#2F1B0C', tail: '#2F1B0C', saddle: '#8B4513' } },
  { key: 'black', name: 'Black', colors: { body: '#2C2C2C', mane: '#0A0A0A', tail: '#0A0A0A', saddle: '#5A3A1E' } },
  { key: 'palomino', name: 'Palomino', colors: { body: '#D4A14A', mane: '#F4E5C2', tail: '#F4E5C2', saddle: '#7A4F1E' } },
  { key: 'grey', name: 'Grey', colors: { body: '#B0B0B5', mane: '#E8E8EC', tail: '#E8E8EC', saddle: '#3F2A18' } },
  { key: 'roan', name: 'Roan', colors: { body: '#7A5C4A', mane: '#3A2620', tail: '#3A2620', saddle: '#2D1810' } },
];

export const RARITIES: readonly HatRarity[] = ['common', 'rare', 'epic', 'legendary', 'limited'];

export function paletteFor(key: string | null | undefined): Palette {
  return PALETTES.find((p) => p.key === key) ?? PALETTES[0]!;
}

export function hatsOf(rarity: HatRarity): Hat[] {
  return HATS.filter((h) => h.rarity === rarity);
}

export function collectibles(): number {
  return HATS.reduce((n, h) => n + variantCount(h), 0);
}

export const rarityLabel = (r: HatRarity) => `${r[0]!.toUpperCase()}${r.slice(1)}`;
