import { leaguePoints, type SeasonStandings } from '@token-derby/shared';
import type { HorseColors } from '../../horse/horse';
import type { WornHat } from '../../hat/hat-pixels';

/** One finisher of a league race, as the division views need it. `division` is 1-based; anything else is left out. */
export type DivisionRunner = {
  readonly id: string; readonly stableId: string; readonly name: string; readonly owner: string;
  readonly colors: HorseColors; readonly hat: WornHat | null;
  readonly tokens: number; readonly joinedAt: number; readonly division: number;
};
export type DivisionResultRow = DivisionRunner & { readonly place: number; readonly points: number };
export type DivisionResult = { readonly division: number; readonly name: string; readonly rows: readonly DivisionResultRow[] };

export type SeasonRowView = {
  readonly stableId: string; readonly name: string; readonly owner: string;
  readonly colors: HorseColors | null; readonly hat: WornHat | null;
  readonly rank: number; readonly points: number; readonly gain: number;
  // Places climbed (negative for dropped), 'new' for a first race this season, null when unchanged.
  readonly movement: number | 'new' | null;
  readonly zone: 'promote' | 'relegate' | null;
};
export type SeasonDivisionView = { readonly division: number; readonly name: string; readonly rows: readonly SeasonRowView[] };
export type SeasonView = {
  readonly season: number; readonly round: number; readonly total: number;
  readonly divisions: readonly SeasonDivisionView[];
  readonly champion: { readonly name: string; readonly owner: string; readonly division: string } | null;
};

/** This race split by division, ordered and scored the same way as the server's scoreLeagueRace. */
export function divisionResults(runners: readonly DivisionRunner[], names: readonly string[]): DivisionResult[] {
  const byDivision = new Map<number, DivisionRunner[]>();
  for (const r of runners) {
    if (!Number.isInteger(r.division) || r.division < 1) continue;
    byDivision.set(r.division, [...(byDivision.get(r.division) ?? []), r]);
  }
  return [...byDivision.keys()].sort((a, b) => a - b).map((division) => ({
    division,
    name: names[division - 1] ?? `Division ${division}`,
    rows: byDivision.get(division)!
      .sort((a, b) => b.tokens - a.tokens || a.joinedAt - b.joinedAt)
      .map((r, i) => ({ ...r, place: i + 1, points: leaguePoints(i + 1) })),
  }));
}

/** Season standings (already including this race) with each horse's gain and movement since before it. */
export function seasonView(standings: SeasonStandings, results: readonly DivisionResult[], round: number): SeasonView {
  const raced = new Map(results.flatMap((d) => d.rows).map((r) => [r.stableId, r]));
  const divisions = standings.divisions.map((d) => {
    const before = [...d.rows]
      .map((row) => ({ row, run: raced.get(row.stable_horse_id) }))
      .sort((a, b) => (b.row.points - (b.run?.points ?? 0)) - (a.row.points - (a.run?.points ?? 0))
        || (b.row.season_tokens - (b.run?.tokens ?? 0)) - (a.row.season_tokens - (a.run?.tokens ?? 0)));
    const earlier = new Map(before.map((e, i) => [e.row.stable_horse_id, i + 1]));
    return {
      division: d.division,
      name: d.name,
      rows: d.rows.map((row): SeasonRowView => {
        const run = raced.get(row.stable_horse_id);
        const gain = run?.points ?? 0;
        const isNew = round > 1 && !!run && row.points === gain && row.season_tokens === run.tokens;
        const moved = earlier.get(row.stable_horse_id)! - row.rank;
        return {
          stableId: row.stable_horse_id, name: row.horse_name, owner: row.user_name,
          colors: run?.colors ?? null, hat: run?.hat ?? null,
          rank: row.rank, points: row.points, gain,
          movement: isNew ? 'new' : moved === 0 ? null : moved,
          zone: row.zone,
        };
      }),
    };
  });
  const top = standings.divisions.find((d) => d.rows.length > 0);
  const lead = top?.rows[0];
  return {
    season: standings.season, round, total: standings.races_per_season, divisions,
    champion: round === standings.races_per_season && top && lead
      ? { name: lead.horse_name, owner: lead.user_name, division: top.name }
      : null,
  };
}
