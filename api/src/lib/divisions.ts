import type { Race } from '@token-derby/shared';
import { getLeague } from '../db/leagues.js';
import { listSeasonStandings } from '../db/league-standings.js';

// League fixtures only: stamps each horse's `division` from this season's
// standings (unscored new entrants default to the bottom division) so both
// the race view and the markets can group/price the field by division.
// No-op — and returns undefined — for non-league races.
export async function stampDivisions<T extends { stable_horse_id?: string; division?: number }>(
  race: Race, horses: T[],
): Promise<string[] | undefined> {
  if (!race.league_id || race.league_season === undefined) return undefined;
  const league = await getLeague(race.league_id); // league_id === org_id
  if (!league) return undefined;

  const bottom = league.divisions.length;
  const divByHorse = new Map<string, number>();
  for (const s of await listSeasonStandings(race.league_id, race.league_season)) {
    divByHorse.set(s.stable_horse_id, s.division);
  }
  for (const h of horses) {
    if (h.stable_horse_id) h.division = divByHorse.get(h.stable_horse_id) ?? bottom;
  }
  return league.divisions.map((d) => d.name);
}
