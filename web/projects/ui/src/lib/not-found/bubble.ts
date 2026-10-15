// "?" thought bubble pixel art, drawn at BUBBLE_UNIT px per cell over the horse's head.
export const BUBBLE_ROWS: readonly string[] = [
  '..oooooooooo..',
  '.owwwwwwwwwwo.',
  'owwwwwwwwwwwwo',
  'owwwwqqqqwwwwo',
  'owwwqqwwqqwwwo',
  'owwwwwwwqqwwwo',
  'owwwwwwqqwwwwo',
  'owwwwwqqwwwwwo',
  'owwwwwwwwwwwwo',
  'owwwwwqqwwwwwo',
  'owwwwwqqwwwwwo',
  '.owwwwwwwwwwo.',
  '..oooooooooo..',
  '..............',
  '....ooo.......',
  '....owo.......',
  '....ooo.......',
  '..............',
  '...oo.........',
  '...oo.........',
];
const BUBBLE_COLOR: Record<string, string> = { o: '#2b1a0e', w: '#f5e9d3', q: '#d94848' };
const BUBBLE_UNIT = 3;
const BUBBLE_ORIGIN = { x: 110, y: 4 }; // in the porthole's 214×214 viewBox

export type BubbleRect = { x: number; y: number; size: number; fill: string };

export function bubbleRects(): BubbleRect[] {
  return BUBBLE_ROWS.flatMap((row, y) =>
    [...row].flatMap((c, x) => {
      const fill = BUBBLE_COLOR[c];
      return fill
        ? [{ x: BUBBLE_ORIGIN.x + x * BUBBLE_UNIT, y: BUBBLE_ORIGIN.y + y * BUBBLE_UNIT, size: BUBBLE_UNIT, fill }]
        : [];
    }),
  );
}
