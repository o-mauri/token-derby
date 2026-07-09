import type { DivisionConfig, LeagueStanding, SeasonStandings, StandingRow } from './types.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Raw request body for a league config — everything is `unknown` so the
// validator can be handed an unparsed JSON object directly.
export type LeagueConfigInput = {
  divisions?: unknown;
  boundaries?: unknown;
  races_per_season?: unknown;
  weekdays?: unknown;
  start_local?: unknown;
  end_local?: unknown;
  max_participants?: unknown;
};

const DIVISION_NAME_MAX = 40;

// Structural validation of a league config. Returns an error message string if
// invalid, or null if valid. Timezone IANA validity is checked by the caller
// (it needs a runtime Intl check), so `tz` is not validated here.
export function validateLeagueConfig(b: LeagueConfigInput): string | null {
  const posInt = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 1;

  if (!Array.isArray(b.divisions) || b.divisions.length < 1) {
    return 'divisions must be a non-empty array';
  }
  const divs = b.divisions as Array<{ name?: unknown; cap?: unknown }>;
  for (let i = 0; i < divs.length; i++) {
    const d = divs[i]!;
    if (typeof d.name !== 'string' || d.name.trim().length < 1 || d.name.length > DIVISION_NAME_MAX) {
      return `division ${i + 1} name must be 1–${DIVISION_NAME_MAX} characters`;
    }
    // Every division except the last (overflow) needs a positive-int cap.
    if (i < divs.length - 1 && !posInt(d.cap)) {
      return `division ${i + 1} cap must be a positive integer`;
    }
  }

  if (!Array.isArray(b.boundaries) || b.boundaries.length !== divs.length - 1) {
    return 'boundaries must have one entry per gap between divisions';
  }
  const bounds = b.boundaries as unknown[];
  for (let i = 0; i < bounds.length; i++) {
    const swap = bounds[i];
    if (!posInt(swap)) return `boundary ${i + 1} swap must be a positive integer`;
    if ((swap as number) > (divs[i]!.cap as number)) {
      return `boundary ${i + 1} swap must not exceed the higher division's cap`;
    }
  }

  if (!posInt(b.races_per_season)) return 'races_per_season must be a positive integer';

  if (!Array.isArray(b.weekdays) || b.weekdays.length === 0 ||
      !b.weekdays.every((d) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7)) {
    return 'weekdays must be a non-empty array of integers 1–7 (1=Mon)';
  }
  if (typeof b.start_local !== 'string' || !HHMM.test(b.start_local)) return 'start_local must be "HH:MM" (24h)';
  if (typeof b.end_local !== 'string' || !HHMM.test(b.end_local)) return 'end_local must be "HH:MM" (24h)';
  if (b.end_local <= b.start_local) return 'end_local must be after start_local';
  if (b.max_participants !== undefined && (!Number.isInteger(b.max_participants) || (b.max_participants as number) < 1)) {
    return 'max_participants must be a positive integer';
  }
  return null;
}

// League fixture display name: the configured/default base with a round marker,
// e.g. "Anthropic League (League Race (4/8))".
export function leagueFixtureName(base: string, round: number, racesPerSeason: number): string {
  return `${base} (League Race (${round}/${racesPerSeason}))`;
}

// League points for a finishing position within a division: among `fieldSize`
// horses that raced, 1st gets `fieldSize`, last gets 1. `rank` is 1-based.
export function linearLeaguePoints(rank: number, fieldSize: number): number {
  return fieldSize - rank + 1;
}

// Assemble display-ready season standings from raw standing rows + league config.
// Groups by division (1..divisions, top flight first — empty divisions included),
// ranks within each by points desc / season_tokens desc / earlier entered_at, and
// flags promotion/relegation zones (top flight never promotes; bottom never
// relegates; zones are clamped so they can't overlap in a small division).
export function buildSeasonStandings(args: {
  org_name: string;
  divisions: { name: string }[];   // ordered top→bottom; count = length
  boundaries: number[];            // per-boundary swap counts
  races_per_season: number;
  season: number;
  round: number;
  standings: LeagueStanding[];
}): SeasonStandings {
  const count = args.divisions.length;
  const byDivision = new Map<number, LeagueStanding[]>();
  for (const s of args.standings) {
    const arr = byDivision.get(s.division) ?? [];
    arr.push(s);
    byDivision.set(s.division, arr);
  }

  const divisions: SeasonStandings['divisions'] = [];
  for (let d = 1; d <= count; d++) {
    const sorted = (byDivision.get(d) ?? []).slice().sort(byStanding);
    const k = sorted.length;
    // Promotion zone from the top boundary of this division; relegation from the bottom.
    let promoteN = d > 1 ? Math.min(args.boundaries[d - 2] ?? 0, k) : 0;
    let relegateN = d < count ? Math.min(args.boundaries[d - 1] ?? 0, k) : 0;
    if (promoteN + relegateN > k) relegateN = Math.max(0, k - promoteN); // never overlap
    const rows: StandingRow[] = sorted.map((s, i) => {
      const rank = i + 1;
      let zone: StandingRow['zone'] = null;
      if (promoteN > 0 && rank <= promoteN) zone = 'promote';
      else if (relegateN > 0 && rank > k - relegateN) zone = 'relegate';
      return {
        rank, stable_horse_id: s.stable_horse_id, horse_name: s.horse_name,
        user_name: s.user_name, points: s.points, season_tokens: s.season_tokens, zone,
      };
    });
    divisions.push({ division: d, name: args.divisions[d - 1]!.name, rows });
  }

  return { org_name: args.org_name, season: args.season, round: args.round, races_per_season: args.races_per_season, divisions };
}

// Placement prize XP: a geometric (front-loaded) curve between a 1000 winner and
// a 75 last place. `rank` is 1-based; `fieldSize` is the number of horses in the
// division. A one-horse division gives the winner 1000.
export function placementPrizeXp(rank: number, fieldSize: number): number {
  if (fieldSize <= 1) return 1000;
  return Math.round(1000 * (75 / 1000) ** ((rank - 1) / (fieldSize - 1)));
}

// The XP a horse actually receives at season end: the placement prize, ×1.25 for
// the top flight, +50 if promoted (stacks after the multiplier), all scaled by the
// anti-farm gate multiplier.
export function seasonPrizeXp(args: {
  rank: number;
  fieldSize: number;
  isTopFlight: boolean;
  promoted: boolean;
  gateMultiplier: number;
}): number {
  const placement = placementPrizeXp(args.rank, args.fieldSize);
  const withMultiplier = Math.round(placement * (args.isTopFlight ? 1.25 : 1));
  const withBonus = withMultiplier + (args.promoted ? 50 : 0);
  return Math.round(withBonus * args.gateMultiplier);
}

// Compare standings by the league tie-break: points desc, season_tokens desc,
// then earlier entered_at.
export function byStanding(a: LeagueStanding, b: LeagueStanding): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.season_tokens !== a.season_tokens) return b.season_tokens - a.season_tokens;
  return a.entered_at < b.entered_at ? -1 : a.entered_at > b.entered_at ? 1 : 0;
}

// Seed a merit-ordered list top-down into divisions 1..count-1 at their per-division
// caps, remainder into the bottom division (count, uncapped). count = divisions.length.
function seedTopDown(ordered: LeagueStanding[], divisions: DivisionConfig[]): Map<string, number> {
  const out = new Map<string, number>();
  const count = divisions.length;
  let cursor = 0;
  for (let d = 1; d < count; d++) {
    const cap = divisions[d - 1]!.cap;
    for (let j = 0; j < cap && cursor < ordered.length; j++, cursor++) {
      out.set(ordered[cursor]!.stable_horse_id, d);
    }
  }
  for (; cursor < ordered.length; cursor++) {
    out.set(ordered[cursor]!.stable_horse_id, count); // bottom / overflow
  }
  return out;
}

// Next-season division assignment for every participant, decided in order:
// season 1 → full seed by points into per-division caps; shape change → re-seed
// by cross-division merit into the new caps; else → per-boundary swaps (steady
// state), whose promoteN/relegateN mirror buildSeasonStandings's zone logic so
// the promotion/relegation zones shown in standings exactly predict these moves.
export function computeNextDivisions(args: {
  standings: LeagueStanding[];
  divisions: DivisionConfig[];
  boundaries: number[];
  season: number;
  shapeChanged: boolean;
}): Map<string, number> {
  const { standings, divisions, boundaries, season, shapeChanged } = args;
  const count = divisions.length;

  // Season 1 (single pool) → full seed by points. Shape change → re-seed by
  // cross-division merit (higher divisions keep precedence). Both fill top-down.
  if (season === 1) {
    return seedTopDown([...standings].sort(byStanding), divisions);
  }
  if (shapeChanged) {
    const merit = [...standings].sort((a, b) =>
      a.division !== b.division ? a.division - b.division : byStanding(a, b));
    return seedTopDown(merit, divisions);
  }

  // Steady state: per-boundary swaps, computed exactly like buildSeasonStandings's
  // zones so the displayed promotion/relegation zones predict these moves.
  const out = new Map<string, number>();
  const byDivision = new Map<number, LeagueStanding[]>();
  for (const s of standings) {
    const arr = byDivision.get(s.division) ?? [];
    arr.push(s);
    byDivision.set(s.division, arr);
  }
  for (const [division, rows] of byDivision) {
    const ranked = rows.slice().sort(byStanding);
    const k = ranked.length;
    let promoteN = division > 1 ? Math.min(boundaries[division - 2] ?? 0, k) : 0;
    let relegateN = division < count ? Math.min(boundaries[division - 1] ?? 0, k) : 0;
    if (promoteN + relegateN > k) relegateN = Math.max(0, k - promoteN);
    ranked.forEach((s, i) => {
      const rank = i + 1;
      let div = division;
      if (promoteN > 0 && rank <= promoteN) div = division - 1;
      else if (relegateN > 0 && rank > k - relegateN) div = division + 1;
      out.set(s.stable_horse_id, div);
    });
  }
  return out;
}
