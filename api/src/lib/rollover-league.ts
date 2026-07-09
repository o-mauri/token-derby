import type { League, LeagueStanding, LeagueSeasonResult, PendingStructural } from '@token-derby/shared';
import { computeNextDivisions, seasonPrizeXp, leagueXpMultiplier, byStanding } from '@token-derby/shared';
import { getLeagueSeason, ensureLeagueSeason, markSeasonComplete } from '../db/league-seasons.js';
import { listSeasonStandings, ensureStanding, tryMarkPrizeAwarded } from '../db/league-standings.js';
import { putSeasonResultIfAbsent } from '../db/league-results.js';
import { commitRollover } from '../db/leagues.js';
import { listRacesByOrgId } from '../db/races.js';
import { finaliseRace } from './finalise-race.js';
import { awardHorseXp } from '../db/stable.js';

// Roll a league's current season over if its final fixture has ended. Idempotent
// prep (force-finalise, mark-then-award prizes, put-if-absent seed + summary) then
// one conditional commit (bump current_season, apply+clear pending_structural).
// Returns true iff this call performed the commit.
export async function rolloverDueLeague(league: League, now: Date): Promise<boolean> {
  const org_id = league.org_id;
  const season = league.current_season;

  const seasonRow = await getLeagueSeason(org_id, season);
  if (!seasonRow || seasonRow.status !== 'active') return false;
  if (!seasonRow.final_fixture_end || now.getTime() < Date.parse(seasonRow.final_fixture_end)) return false;

  // 1. Force-finalise every fixture of this season (idempotent; runs scoreLeagueRace).
  const races = (await listRacesByOrgId(org_id)).filter(
    (r) => r.league_id === org_id && r.league_season === season,
  );
  for (const race of races) {
    if (!race.ended_at) await finaliseRace(race, now);
  }

  // Final standings (complete now that all fixtures are finalised).
  const standings = await listSeasonStandings(org_id, season);

  // Next-season shape = pending merged over current; shapeChanged = divisions/boundaries edited.
  const pending = league.pending_structural ?? null;
  const nextDivisionsCfg = pending?.divisions ?? league.divisions;
  const nextBoundaries = pending?.boundaries ?? league.boundaries;
  const shapeChanged = !!(pending?.divisions || pending?.boundaries);
  const nextDivision = computeNextDivisions({
    standings, divisions: nextDivisionsCfg, boundaries: nextBoundaries, season, shapeChanged,
  });

  // 2. Award prizes (mark-then-award). Gate is per-season, whole-league.
  const gate = leagueXpMultiplier(standings.length);
  const byDivision = new Map<number, LeagueStanding[]>();
  for (const s of standings) {
    const arr = byDivision.get(s.division) ?? [];
    arr.push(s);
    byDivision.set(s.division, arr);
  }
  for (const [division, rowsUnsorted] of byDivision) {
    const rows = rowsUnsorted.slice().sort(byStanding);
    const fieldSize = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const nd = nextDivision.get(row.stable_horse_id) ?? division;
      const xp = seasonPrizeXp({
        rank: i + 1, fieldSize, isTopFlight: division === 1, promoted: nd < division, gateMultiplier: gate,
      });
      if (xp > 0 && (await tryMarkPrizeAwarded(org_id, season, division, row.stable_horse_id))) {
        await awardHorseXp(row.user_id, row.stable_horse_id, xp);
      }
    }
  }

  // 3. Seed the next season (put-if-absent per row + season row).
  const nextSeason = season + 1;
  await ensureLeagueSeason(org_id, nextSeason);
  for (const s of standings) {
    const nd = nextDivision.get(s.stable_horse_id) ?? s.division;
    await ensureStanding({
      org_id, season: nextSeason, division: nd,
      stable_horse_id: s.stable_horse_id, horse_name: s.horse_name,
      user_id: s.user_id, user_name: s.user_name,
      points: 0, season_tokens: 0, entered_at: now.toISOString(),
    });
  }

  // 4. Season summary (put-if-absent). Champion = division-1 rank-1; per-division winners.
  const promoted: string[] = [];
  const relegated: string[] = [];
  for (const s of standings) {
    const nd = nextDivision.get(s.stable_horse_id) ?? s.division;
    if (nd < s.division) promoted.push(s.stable_horse_id);
    else if (nd > s.division) relegated.push(s.stable_horse_id);
  }
  const division_champions: LeagueSeasonResult['division_champions'] = [];
  for (let d = 1; d <= league.divisions.length; d++) {
    const rows = (byDivision.get(d) ?? []).slice().sort(byStanding);
    const top = rows[0];
    if (top) division_champions.push({ division: d, name: league.divisions[d - 1]!.name, stable_horse_id: top.stable_horse_id, horse_name: top.horse_name });
  }
  // Season champion = winner of the highest populated flight (division 1 in
  // steady state; the single bottom pool in season 1, where higher divisions are
  // empty). NOT the global points leader: points are per-division field-size, so
  // a dominant lower division can out-point the top flight. Scan divisions in
  // order and take the first populated one's leader (same horse as
  // division_champions[0], but carrying points/user_name for the summary).
  const championStanding = (() => {
    for (let d = 1; d <= league.divisions.length; d++) {
      const rows = (byDivision.get(d) ?? []).slice().sort(byStanding);
      if (rows.length > 0) return rows[0]!;
    }
    return undefined;
  })();
  await putSeasonResultIfAbsent({
    org_id, season,
    champion: championStanding
      ? {
          stable_horse_id: championStanding.stable_horse_id,
          horse_name: championStanding.horse_name,
          user_name: championStanding.user_name,
          points: championStanding.points,
        }
      : null,
    division_champions, promoted, relegated,
    division_names: league.divisions.map((d) => d.name),
    finished_at: now.toISOString(),
  });

  // 5. Commit: bump season + apply/clear pending (conditional on still being `season`).
  const applied: PendingStructural | null = pending;
  const committed = await commitRollover(org_id, season, applied);
  if (committed) await markSeasonComplete(org_id, season);
  return committed;
}
