// Pixel slot tags. `null` = transparent.
//   B = body, M = mane, T = tail, S = saddle, E = eye (fixed black), H = hoof (fixed dark)
export type SlotTag = 'B' | 'M' | 'T' | 'S' | 'E' | 'H' | null;

export const FIXED_COLORS = {
  E: '#000000',
  H: '#1F1108',
} as const;

const MAIN_ROWS: readonly string[] = [
  '................................',
  '................................',
  '............MMMM................',
  '...........MMMMMM...............',
  '..........MMMMMMMM..............',
  '.........MMMBBBBBB..............',
  '........MMMMBBBBBB..............',
  '.......MMMMBBBBBBBE.............',
  '.....MMMMBBBBBBBBB..............',
  '....MBBBBBBBBBBBB...............',
  '...TBBBBBBBBBBBB................',
  '..TTBBBBBSSSSBBB................',
  '.TTTBBBBSSSSBBB.................',
  'TTTBBBBBSSSSBBB.................',
  'TTBBBBBBBBBBBB..................',
  '..BBBB.BB.BBBB..................',
  '..BBBB.BB.BBBB..................',
  '..BBBB.BB.BBBB..................',
  '..BBBB.BB.BBBB..................',
  '..BBBB.BB.BBBB..................',
  '..BBBB.BB.BBBB..................',
  '..HHHH.HH.HHHH..................',
  '................................',
  '................................',
];

const MINI_ROWS: readonly string[] = [
  '..MMBE..',
  '.MBBBBB.',
  'TBBSSBB.',
  '.HH.HH..',
];

export const MAIN_SPRITE: readonly (readonly SlotTag[])[] = parse(MAIN_ROWS, 32, 24);
export const MINI_SPRITE: readonly (readonly SlotTag[])[] = parse(MINI_ROWS, 8, 4);

function parse(rows: readonly string[], width: number, height: number): SlotTag[][] {
  if (rows.length !== height) {
    throw new Error(`sprite has ${rows.length} rows, expected ${height}`);
  }
  return rows.map((row, y) => {
    if (row.length !== width) {
      throw new Error(`sprite row ${y} has length ${row.length}, expected ${width}`);
    }
    return [...row].map(c => toTag(c));
  });
}

function toTag(c: string): SlotTag {
  switch (c) {
    case 'B': return 'B';
    case 'M': return 'M';
    case 'T': return 'T';
    case 'S': return 'S';
    case 'E': return 'E';
    case 'H': return 'H';
    case '.': return null;
    default: throw new Error(`unknown sprite char: ${c}`);
  }
}
