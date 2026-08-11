import type { SeasonStandings } from '@token-derby/shared';
import type { DetailTone } from './horse-detail.js';

export type LeagueRow = {
  rank: number;
  horseName: string;
  userName: string;
  points: number;
  seasonTokens: number;
  isYou: boolean;
  // Promotion reads as good, relegation as bad; mid-table has no tone.
  tone?: DetailTone;
};

export type LeagueGroup = {
  division: number;
  name: string;
  rows: LeagueRow[];
};

// `round` is fixtures_materialised, which counts a fixture that is still running,
// so this is worded as scheduling. Saying "4 of 8 complete" would imply the live
// race's points are already in the table below, and they are not — standings only
// gain points when a race finalises.
export function seasonLabel(standings: SeasonStandings): string {
  return `Season ${standings.season} · Round ${standings.round} of ${standings.races_per_season}`;
}

// Divisions arrive top-flight-first from the server and stay that way. Empty
// flights are kept: a division nobody is in is still part of the league, and
// dropping it would silently renumber what the reader sees.
export function mapLeagueStandings(
  standings: SeasonStandings,
  yourStableHorseIds: ReadonlySet<string>,
): LeagueGroup[] {
  return standings.divisions.map((d) => ({
    division: d.division,
    name: d.name,
    rows: d.rows.map((r) => ({
      rank: r.rank,
      horseName: r.horse_name,
      userName: r.user_name,
      points: r.points,
      seasonTokens: r.season_tokens,
      isYou: yourStableHorseIds.has(r.stable_horse_id),
      tone: r.zone === 'promote' ? ('good' as const) : r.zone === 'relegate' ? ('bad' as const) : undefined,
    })),
  }));
}
