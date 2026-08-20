import type { Race, Horse } from '@token-derby/shared';
import { leaguePoints } from '@token-derby/shared';
import { getLeague } from '../db/leagues.js';
import { listOrgMemberIds } from '../db/organisations.js';
import { listSeasonStandings, ensureStanding, addStandingPointsForRound } from '../db/league-standings.js';

// A finisher as scoreLeagueRace requires it: both token figures already
// stamped (finaliseRace's `stamped` array guarantees this for its sole caller).
export type FinishedHorse = Horse & { final_tokens: number; final_scored_tokens: number };

// This fixture's finish, split by division — returned so callers (the end-of-race
// webhook) can report the per-division order without re-deriving it.
export type LeagueRaceResult = {
  season: number;
  round: number;
  divisions: Array<{
    division: number;
    order: Array<{
      position: number;
      stable_horse_id: string;
      horse_name: string;
      user_name: string;
      final_tokens: number;
      final_scored_tokens: number;
      points_awarded: number;
    }>;
  }>;
};

// Award league points for a finished league fixture. No-op (returns null) unless
// the race is a league fixture with a live league and ≥1 participating member.
// Idempotent per (horse, round). Returns the per-division breakdown otherwise.
export async function scoreLeagueRace(
  race: Race,
  horses: FinishedHorse[],
): Promise<LeagueRaceResult | null> {
  if (!race.league_id || race.league_season === undefined || race.league_round === undefined) return null;
  const org_id = race.league_id; // one league per org → league_id === org_id
  const league = await getLeague(org_id);
  if (!league) return null; // deleted mid-season
  const season = race.league_season;
  const round = race.league_round;
  const bottom = league.divisions.length;

  const members = new Set(await listOrgMemberIds(org_id));
  const participants = horses.filter(
    (h): h is FinishedHorse & { stable_horse_id: string; user_id: string } =>
      Boolean(h.stable_horse_id) && Boolean(h.user_id) && members.has(h.user_id),
  );
  if (participants.length === 0) return null;

  const divByHorse = new Map<string, number>();
  for (const s of await listSeasonStandings(org_id, season)) divByHorse.set(s.stable_horse_id, s.division);

  const now = new Date().toISOString();
  // Resolve each participant's division; create bottom-division rows for new entrants.
  const withDivision: { h: typeof participants[number]; division: number }[] = [];
  for (const h of participants) {
    let division = divByHorse.get(h.stable_horse_id);
    if (division === undefined) {
      division = bottom;
      await ensureStanding({
        org_id, season, division, stable_horse_id: h.stable_horse_id,
        horse_name: h.name, user_id: h.user_id, user_name: h.user_name,
        points: 0, season_tokens: 0, entered_at: now,
      });
    }
    withDivision.push({ h, division });
  }

  // Bucket by division, rank within each by scored distance (join-time
  // tie-break), award fixed-table points.
  const buckets = new Map<number, typeof withDivision>();
  for (const w of withDivision) {
    const arr = buckets.get(w.division) ?? [];
    arr.push(w);
    buckets.set(w.division, arr);
  }
  const resultDivisions: LeagueRaceResult['divisions'] = [];
  for (const [division, bucket] of buckets) {
    bucket.sort((a, b) => {
      if (b.h.final_scored_tokens !== a.h.final_scored_tokens) {
        return b.h.final_scored_tokens - a.h.final_scored_tokens;
      }
      return new Date(a.h.joined_at).getTime() - new Date(b.h.joined_at).getTime();
    });
    const order: LeagueRaceResult['divisions'][number]['order'] = [];
    for (let i = 0; i < bucket.length; i++) {
      const { h } = bucket[i]!;
      const points = leaguePoints(i + 1);
      await addStandingPointsForRound(org_id, season, division, h.stable_horse_id, points, h.final_scored_tokens, round);
      order.push({
        position: i + 1,
        stable_horse_id: h.stable_horse_id,
        horse_name: h.name,
        user_name: h.user_name,
        final_tokens: h.final_tokens,
        final_scored_tokens: h.final_scored_tokens,
        points_awarded: points,
      });
    }
    resultDivisions.push({ division, order });
  }
  // Ordered top → bottom for stable webhook output.
  resultDivisions.sort((a, b) => a.division - b.division);
  return { season, round, divisions: resultDivisions };
}
