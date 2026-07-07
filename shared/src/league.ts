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
