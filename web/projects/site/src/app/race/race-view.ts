import type { GetRaceResponse, HorseView, SeasonStandings } from '@token-derby/shared';
import { levelFromXp, resolveStaminaConfig, runsModifier, scoredOf, staminaOf } from '@token-derby/shared';
import {
  type CountdownAnchor, type FinishView, type LaneState, type LaneView, type TickerCell,
  collectFreshItems, elapsedPct, laneProgress, leaderTokens, leagueOrderCells, leagueStandingsCells, staminaBand,
} from '@token-derby/ui';

export function laneState(race: GetRaceResponse): LaneState {
  return race.status;
}

export function countdownAnchor(race: GetRaceResponse, nowMs: number): CountdownAnchor {
  return { atMs: nowMs, timeLeftSeconds: race.time_left_seconds };
}

// Competition ranking by scored distance: ties share a place, matching the track and the ticker.
const placeOf = (h: HorseView, field: readonly HorseView[]) => 1 + field.filter((o) => scoredOf(o) > scoredOf(h)).length;

/** The track for a snapshot: lanes in join order, and how far along each horse is. */
export function raceLanes(race: GetRaceResponse, now: Date): { lanes: LaneView[]; progressById: Record<string, number> } {
  const field = race.horses;
  const ordered = [...field].sort((a, b) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
  const elapsed = elapsedPct(race.start_time, race.end_time, now);
  const leader = leaderTokens(field.map(scoredOf));
  const stamina = runsModifier(race, 'stamina') ? resolveStaminaConfig(race) : null;
  const names = race.league_id != null ? race.league_division_names : undefined;

  const lanes = ordered.map((h): LaneView => {
    const value = stamina ? staminaOf(h) : 0;
    return {
      id: h.horse_id,
      name: h.name,
      owner: h.user_name ?? '',
      colors: h.colors,
      hat: h.equipped_hat ? { id: h.equipped_hat.id, variant: h.equipped_hat.variant } : null,
      tokens: h.final_scored_tokens ?? scoredOf(h),
      level: levelFromXp(h.xp + (h.live_xp ?? 0)),
      pace: h.pace_15m ?? null,
      position: placeOf(h, field),
      league: names && h.division !== undefined
        ? { rank: placeOf(h, field.filter((o) => o.division === h.division)), division: names[h.division - 1] ?? `Div ${h.division}` }
        : null,
      stamina: stamina ? { value, band: staminaBand(value, stamina.taper_floor) } : null,
    };
  });
  const progressById = Object.fromEntries(field.map((h) => [h.horse_id, laneProgress(scoredOf(h), leader, elapsed)]));
  return { lanes, progressById };
}

/** The finished screen's results, in final rank order. */
export function finishViews(race: GetRaceResponse): FinishView[] {
  const ranked = [...race.horses].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const tokensOf = (h: HorseView) => h.final_scored_tokens ?? scoredOf(h);
  const winner = ranked[0] ? tokensOf(ranked[0]) : 0;
  return ranked.map((h, i) => ({
    id: h.horse_id,
    position: h.rank ?? i + 1,
    name: h.name,
    owner: h.user_name ?? '',
    colors: h.colors,
    hat: h.equipped_hat ? { id: h.equipped_hat.id, variant: h.equipped_hat.variant } : null,
    tokens: tokensOf(h),
    behind: i === 0 ? null : Math.max(0, winner - tokensOf(h)),
    xpBefore: h.xp,
    xpAwarded: h.xp_awarded ?? 0,
  }));
}

/** Builds the live ticker across polls: the order, then (leagues) projected standings, then achievements.
 *  Remembers which events it has shown, keeps the last achievements rolling, and caches season standings. */
export class RaceTickerComposer {
  private readonly shownAt = new Map<string, number>();
  private achievements: TickerCell[] = [];
  private standings: SeasonStandings | null = null;
  private standingsInFlight = false;

  update(race: GetRaceResponse): TickerCell[] {
    if (race.status !== 'live') return [];
    const fresh = collectFreshItems(race, this.shownAt);
    if (fresh.length) {
      this.achievements = fresh.flatMap((item, i): TickerCell[] =>
        i === 0 ? [{ kind: 'achievement', item }] : [{ kind: 'sep' }, { kind: 'achievement', item }],
      );
    }
    const isLeague = race.league_id != null;
    const cells = leagueOrderCells(race);
    if (isLeague && this.standings) cells.push({ kind: 'sectiongap', wide: true }, ...leagueStandingsCells(race, this.standings));
    if (this.achievements.length) cells.push({ kind: 'sectiongap', wide: isLeague }, ...this.achievements);
    return cells;
  }

  /** The standings to fetch for this race, if it's a league fixture and they aren't loaded or loading. */
  standingsWanted(race: GetRaceResponse): { org: string; season: number } | null {
    if (this.standings || this.standingsInFlight) return null;
    if (race.league_id == null || !race.organisation_name || race.league_season === undefined) return null;
    return { org: race.organisation_name, season: race.league_season };
  }

  standingsRequested(): void { this.standingsInFlight = true; }
  standingsLoaded(standings: SeasonStandings | null): void { this.standings = standings; this.standingsInFlight = false; }
  // A failed load is retried on a later poll.
  standingsFailed(): void { this.standingsInFlight = false; }
}
