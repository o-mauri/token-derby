import type { LaneView } from '../models';

/** One horse on a hover card's gap track. `delta` is the hovered horse's tokens minus this one's. */
export type ChaseMark = {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  readonly you: boolean;
  readonly delta: number;
  // Left edge of the mark along the gap track, in percent.
  readonly at: number;
};

const START = 10;
const END = 90;
// A runaway leader would otherwise squash a close rival onto the hovered horse.
const MIN_GAP = 18;

/** The hovered horse and its two rivals, behind to ahead: the two chasers for the leader,
 *  the chaser and the leader for 2nd, otherwise the horse directly ahead and the leader. */
export function chaseMarks(field: readonly LaneView[], id: string): ChaseMark[] {
  const order = [...field].sort((a, b) => a.position - b.position);
  const i = order.findIndex((l) => l.id === id);
  if (i < 0 || order.length < 2) return [];
  const you = order[i]!;
  const rivals = i === 0 ? order.slice(1, 3) : i === 1 ? [order[2], order[0]] : [order[i - 1], order[0]];
  const lanes = [you, ...rivals.filter((l): l is LaneView => !!l)]
    .sort((a, b) => a.tokens - b.tokens || b.position - a.position);

  const low = lanes[0]!.tokens;
  const span = lanes.at(-1)!.tokens - low;
  return lanes.map((l, n) => ({
    id: l.id, name: l.name, position: l.position, you: l === you, delta: you.tokens - l.tokens,
    at: n === 0 ? START : n === lanes.length - 1 ? END : middle(span ? (l.tokens - low) / span : 0.5),
  }));
}

function middle(share: number): number {
  return Math.min(END - MIN_GAP, Math.max(START + MIN_GAP, START + (END - START) * share));
}

const UNITS: readonly (readonly [number, string])[] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']];

/** A token count to three significant figures, e.g. 37.7k or 1.24M; under a thousand stays whole. */
export function shortTokens(n: number): string {
  const abs = Math.abs(n);
  if (Math.round(abs) < 1000) return String(Math.round(abs));
  // Smallest-first fallback lets 999,600 round up to 1.00M instead of reading 1000k.
  for (const [size, unit] of [...UNITS].reverse()) {
    const text = (abs / size).toPrecision(3);
    if (Number(text) < 1000 || size === UNITS[0]![0]) return `${text}${unit}`;
  }
  return String(abs);
}

/** A gap with its sign: + when ahead, a minus sign when behind. */
export function signedTokens(delta: number): string {
  const text = shortTokens(delta);
  return text === '0' ? text : `${delta < 0 ? '−' : '+'}${text}`;
}
