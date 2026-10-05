import type { HorseColors } from '../horse/horse';
import type { HorseChipLeague } from '../horse-chip/horse-chip';
import type { WornHat } from '../hat/hat-pixels';

export type LaneState = 'pending' | 'live' | 'finished';
export type StaminaBand = 'high' | 'mid' | 'low';

/** Everything a race lane shows about one horse. The race page maps API data into this. */
export type LaneView = {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly colors: HorseColors;
  readonly hat: WornHat | null;
  readonly tokens: number;
  readonly level: number;
  readonly pace: number | null;
  readonly position: number;
  readonly league: HorseChipLeague | null;
  // Null when the race runs with stamina off.
  readonly stamina: { readonly value: number; readonly band: StaminaBand } | null;
};

/** One horse's result on the finished screen. The race page maps final race data into this. */
export type FinishView = {
  readonly id: string;
  readonly position: number;
  readonly name: string;
  readonly owner: string;
  readonly colors: HorseColors;
  readonly hat: WornHat | null;
  readonly tokens: number;
  // Tokens behind the winner; null for the winner.
  readonly behind: number | null;
  readonly xpBefore: number;
  readonly xpAwarded: number;
};
