import type { HorseColors } from '../horse/horse';
import type { WornHat } from '../hat/hat-pixels';
import type { CountdownAnchor } from '../race/logic/time';

/** A horse as the org pages show it. */
export type OrgRunner = {
  readonly id: string; readonly name: string; readonly owner: string;
  readonly colors: HorseColors; readonly hat: WornHat | null; readonly tokens: number;
};

export type LiveLeader = OrgRunner & { readonly pace: number | null };
export type Chaser = OrgRunner & { readonly place: number; readonly gap: number };

export type LivePanelView =
  | { readonly kind: 'live'; readonly code: string; readonly name: string; readonly runners: number | null;
      readonly leader: LiveLeader | null; readonly chasers: readonly Chaser[];
      readonly anchor: CountdownAnchor; readonly elapsedPct: number }
  | { readonly kind: 'next'; readonly code: string; readonly name: string; readonly startsAt: string; readonly anchor: CountdownAnchor }
  | { readonly kind: 'none' };

export type LeagueColumn = {
  readonly name: string;
  readonly leader: (OrgRunner & { readonly points: number }) | null;
  readonly rest: readonly (OrgRunner & { readonly place: number; readonly points: number })[];
};
export type LeaguePanelView = {
  readonly season: number; readonly round: number; readonly total: number;
  readonly columns: readonly LeagueColumn[]; readonly moreDivisions: number;
} | null;

export type StatsPanelView = {
  readonly racesRun: number;
  readonly mostWins: (OrgRunner & { readonly wins: number }) | null;
  readonly totalTokens: number | null;
  readonly lastTen: readonly (number | null)[];
};

export type ResultRow = {
  readonly code: string; readonly date: string; readonly name: string;
  readonly winner: OrgRunner | null; readonly tokens: number | null;
  readonly runners: number | null; readonly total: number | null;
};
export type NextRace = { readonly code: string; readonly name: string; readonly startsAt: string; readonly anchor: CountdownAnchor };
export type RacesPanelView = { readonly next: NextRace | null; readonly latest: readonly ResultRow[]; readonly count: number };

export type LiveRow = {
  readonly code: string; readonly name: string; readonly leader: OrgRunner | null;
  readonly tokens: number | null; readonly runners: number | null; readonly anchor: CountdownAnchor;
};
export type UpcomingRow = { readonly code: string; readonly name: string; readonly startsAt: string; readonly date: string; readonly time: string; readonly startsIn: string; readonly anchor: CountdownAnchor };
export type MonthLink = { readonly key: string; readonly label: string };
