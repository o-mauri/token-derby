export type SlotTag = 'B' | 'M' | 'T' | 'S' | 'H' | null;

// Matches cli/src/ui/sprite.ts — same visual horse in SVG form.
const ROWS: readonly string[] = [
  '................................',
  '................................',
  '..........................MMM...',
  '..........................MMM...',
  '.........................MBBEBB.',
  '.........................MBBEBB.',
  '........................MBBBBBBB',
  '........................MBBBBBBB',
  '..................MMMMMMMBBB....',
  '..................MMMMMMMBBB....',
  '....BBBBBBBBSSSSSSMMBBBBBB......',
  '...BBBBBBBBBSSSSSSMMBBBBBB......',
  '.TTBBBBBBBBBSSSSSSBBBBBBBB......',
  '.TTBBBBBBBBBSSSSSSBBBBBBBB......',
  'TTTBBBBBBBBBBBBBBBBBBBBBBB......',
  'TTTBBBBBBBBBBBBBBBBBBBBB........',
  '...BBB.BBB.....BBB.BBB..........',
  '...BBB.BBB.....BBB.BBB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '....BB..BB......BB..BB..........',
  '...HHH.HHH.....HHH.HHH..........',
];

export const GRID: readonly (readonly SlotTag[])[] = ROWS.map((row, y) => {
  if (row.length !== 32) throw new Error(`sprite row ${y} has length ${row.length}, expected 32`);
  return [...row].map(c => toTag(c, y));
});

function toTag(c: string, y: number): SlotTag {
  switch (c) {
    case 'B': return 'B';
    case 'M': return 'M';
    case 'T': return 'T';
    case 'S': return 'S';
    case 'H': return 'H';
    case 'E': return 'B';
    case '.': return null;
    default: throw new Error(`unknown sprite char '${c}' at y=${y}`);
  }
}

export const SPRITE_WIDTH = 32;
export const SPRITE_HEIGHT = 24;
