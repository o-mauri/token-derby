import type { HorseView, RaceView } from '@token-derby/shared';
import type { Standing } from './race-standings.js';

export type DivisionFilter = { value: number | null; label: string };

function divisionNames(race: RaceView): string[] | null {
  if (!race.league_id) return null;
  const names = race.league_division_names;
  return names && names.length > 0 ? names : null;
}

// The horse's division, or null when this isn't a league fixture.
//
// An unscored new entrant has no division yet and is scored in the BOTTOM one —
// the same rule as site/src/render/ticker.ts and projectedGains, both of which
// mirror the server's score-league-race. (The site's graph filter instead drops
// these horses from every division; that loses a real racer, so it isn't copied.)
export function divisionOf(race: RaceView, horse: HorseView): number | null {
  const names = divisionNames(race);
  if (!names) return null;
  return horse.division ?? names.length;
}

// `All` plus one entry per division, top flight first. Empty for a standard race,
// so the caller renders no control at all rather than a pointless single option.
export function divisionFilters(race: RaceView): DivisionFilter[] {
  const names = divisionNames(race);
  if (!names) return [];
  return [
    { value: null, label: 'All' },
    ...names.map((label, i) => ({ value: i + 1, label })),
  ];
}

// Narrow the standings to one division, renumbering rank from 1. League points
// are awarded by position WITHIN a division, so the division rank is the number
// that matters once a division is selected. Input order is preserved (mapStandings
// has already sorted by rank), and `null` is a passthrough.
export function applyDivisionFilter(standings: Standing[], division: number | null): Standing[] {
  if (division === null) return standings;
  return standings
    .filter((s) => s.division === division)
    .map((s, i) => ({ ...s, rank: i + 1 }));
}
