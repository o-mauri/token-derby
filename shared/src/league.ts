import type { LeagueStanding, SeasonStandings, StandingRow } from './types.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Raw request body for a league config — everything is `unknown` so the
// validator can be handed an unparsed JSON object directly.
export type LeagueConfigInput = {
  divisions?: unknown;
  racers_per_division?: unknown;
  races_per_season?: unknown;
  promote_relegate_count?: unknown;
  weekdays?: unknown;
  start_local?: unknown;
  end_local?: unknown;
  max_participants?: unknown;
};

// Structural validation of a league config. Returns an error message string if
// invalid, or null if valid. Timezone IANA validity is checked by the caller
// (it needs a runtime Intl check), so `tz` is not validated here.
export function validateLeagueConfig(b: LeagueConfigInput): string | null {
  const posInt = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 1;

  if (!posInt(b.divisions)) return 'divisions must be a positive integer';
  if (!posInt(b.racers_per_division)) return 'racers_per_division must be a positive integer';
  if (!posInt(b.races_per_season)) return 'races_per_season must be a positive integer';

  if (!Number.isInteger(b.promote_relegate_count) || (b.promote_relegate_count as number) < 0) {
    return 'promote_relegate_count must be a non-negative integer';
  }
  if ((b.promote_relegate_count as number) >= (b.racers_per_division as number)) {
    return 'promote_relegate_count must be less than racers_per_division';
  }

  if (!Array.isArray(b.weekdays) || b.weekdays.length === 0 ||
      !b.weekdays.every((d) => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 7)) {
    return 'weekdays must be a non-empty array of integers 1–7 (1=Mon)';
  }

  if (typeof b.start_local !== 'string' || !HHMM.test(b.start_local)) {
    return 'start_local must be "HH:MM" (24h)';
  }
  if (typeof b.end_local !== 'string' || !HHMM.test(b.end_local)) {
    return 'end_local must be "HH:MM" (24h)';
  }
  if (b.end_local <= b.start_local) {
    return 'end_local must be after start_local';
  }

  if (b.max_participants !== undefined &&
      (!Number.isInteger(b.max_participants) || (b.max_participants as number) < 1)) {
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
  divisions: number;
  promote_relegate_count: number;
  races_per_season: number;
  season: number;
  round: number;
  standings: LeagueStanding[];
}): SeasonStandings {
  const byDivision = new Map<number, LeagueStanding[]>();
  for (const s of args.standings) {
    const arr = byDivision.get(s.division) ?? [];
    arr.push(s);
    byDivision.set(s.division, arr);
  }

  const divisions: SeasonStandings['divisions'] = [];
  for (let d = 1; d <= args.divisions; d++) {
    const sorted = (byDivision.get(d) ?? []).slice().sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.season_tokens !== a.season_tokens) return b.season_tokens - a.season_tokens;
      return a.entered_at < b.entered_at ? -1 : a.entered_at > b.entered_at ? 1 : 0;
    });
    const k = sorted.length;
    const hasPromote = d > 1;                 // top flight never promotes
    const hasRelegate = d < args.divisions;   // bottom division never relegates
    let promoteN = hasPromote ? Math.min(args.promote_relegate_count, k) : 0;
    let relegateN = hasRelegate ? Math.min(args.promote_relegate_count, k) : 0;
    // The overlap clamp only applies when BOTH zones are present (a middle
    // division): shrink each to floor(k/2) so promotion and relegation can't
    // claim the same row. Single-zone divisions (top flight, bottom) have no
    // overlap to prevent, so they keep the full count.
    if (hasPromote && hasRelegate && promoteN + relegateN > k) {
      const half = Math.floor(k / 2);
      promoteN = half;
      relegateN = half;
    }
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
    divisions.push({ division: d, rows });
  }

  return {
    org_name: args.org_name, season: args.season, round: args.round,
    races_per_season: args.races_per_season, divisions,
  };
}
