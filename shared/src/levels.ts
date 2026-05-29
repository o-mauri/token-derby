/**
 * Horse XP / level curve.
 *
 * The cost (in XP) to advance from level `n` to level `n+1` is given by:
 *
 *     xpForLevel(n) = 1.8 n^3 + 18 n^2 + 50 n − 19.8
 *
 * So the cumulative XP at which a horse becomes each level is:
 *
 *     Level 1  → 0           (every new horse starts here at 0 XP)
 *     Level 2  → xpForLevel(1)  = 50
 *     Level 3  → xpForLevel(2)  = 166.6
 *     Level 4  → xpForLevel(3)  = 340.8
 *     ...
 *     Level 30 → xpForLevel(29) = 60,468.4
 *
 * To redesign the curve, edit `xpForLevel` below or bump `MAX_LEVEL`.
 * Levels are derived from XP — they are not stored on the horse, so changing
 * this file re-levels every horse without needing a migration.
 */

export const MAX_LEVEL = 30;

export function xpForLevel(n: number): number {
  return 1.8 * n ** 3 + 18 * n ** 2 + 50 * n - 19.8;
}

/**
 * Cumulative XP at which a horse first becomes `level`. Level 1 is the
 * starting state, so its threshold is 0.
 */
export function thresholdForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(xpForLevel(level - 1));
}

/**
 * Convenience: total XP thresholds for each level, in order.
 * `XP_THRESHOLDS[i]` is the cumulative XP needed to be level `i+1`.
 */
export const XP_THRESHOLDS: readonly number[] = Array.from(
  { length: MAX_LEVEL },
  (_, i) => thresholdForLevel(i + 1),
);

export type LevelInfo = {
  level: number;
  xp: number;
  level_start_xp: number;
  next_level_xp: number | null;
  xp_into_level: number;
  xp_for_level: number | null;
  progress: number;
};

export function levelFromXp(xp: number): number {
  const v = Math.max(0, Math.floor(xp));
  let level = 1;
  while (level < MAX_LEVEL && v >= thresholdForLevel(level + 1)) {
    level++;
  }
  return level;
}

export function levelInfo(xp: number): LevelInfo {
  const v = Math.max(0, Math.floor(xp));
  const level = levelFromXp(v);
  const level_start_xp = thresholdForLevel(level);
  const isMax = level >= MAX_LEVEL;
  const next_level_xp = isMax ? null : thresholdForLevel(level + 1);
  const xp_into_level = v - level_start_xp;
  const xp_for_level = isMax ? null : (next_level_xp! - level_start_xp);
  const progress = isMax ? 1 : Math.min(1, xp_into_level / Math.max(1, xp_for_level!));
  return { level, xp: v, level_start_xp, next_level_xp, xp_into_level, xp_for_level, progress };
}

/**
 * XP awarded for finishing a race. Components stack:
 *   compete      → every horse that joined gets this
 *   podium       → top 3 finishers
 *   runner_up    → 2nd place
 *   winner       → 1st place
 *
 * So a winner gets compete + podium + winner = 80 XP.
 * Edit these values to retune.
 */
export const XP_AWARDS = {
  compete: 25,
  podium: 25,
  runner_up: 15,
  winner: 30,
  token_bonus_max: 15,
} as const;

export function xpForRaceResult(rank: number): number {
  let xp = XP_AWARDS.compete;
  if (rank <= 3) xp += XP_AWARDS.podium;
  if (rank === 2) xp += XP_AWARDS.runner_up;
  if (rank === 1) xp += XP_AWARDS.winner;
  return xp;
}

/**
 * Token-proportional XP bonus, layered on top of {@link xpForRaceResult}.
 *   Winner always gets the full `token_bonus_max` (15).
 *   Everyone else gets `round(tokens / winner_tokens * token_bonus_max)`.
 * Falls back to 0 if `winner_tokens` is non-positive (degenerate race).
 */
export function xpForTokenBonus(rank: number, tokens: number, winner_tokens: number): number {
  if (rank === 1) return XP_AWARDS.token_bonus_max;
  if (winner_tokens <= 0) return 0;
  const ratio = Math.max(0, tokens) / winner_tokens;
  return Math.round(Math.min(1, ratio) * XP_AWARDS.token_bonus_max);
}

// Total XP a horse earns from a finished race: rank bonus + token bonus + any
// live XP it already banked during the race.
export function xpForRaceFinish(
  rank: number,
  tokens: number,
  winner_tokens: number,
  live_xp: number | undefined = 0,
): number {
  return xpForRaceResult(rank) + xpForTokenBonus(rank, tokens, winner_tokens) + (live_xp ?? 0);
}

/**
 * Anti-farm gate for persistent race XP.
 *
 * Persistent XP is the only currency that buys hat rolls (rolls accrue on
 * level-up, levels derive from XP), so XP has to be expensive to mint. Without
 * a gate, anyone can spin up a free user, create a free race, join their own
 * horse, and end it instantly for a flat ~95 XP — the "infinite horses" farm
 * reborn one layer down. This gate makes XP require a *real, sustained
 * competition* that a solo attacker can't fabricate on demand.
 *
 * Two independent factors each scale the awarded XP:
 *   Distinct jockeys:  ≥3 → full, exactly 2 → half, ≤1 → none
 *   Race duration:     ≥3h → full, ≥2h → half, <2h → none
 *
 * The factors do NOT stack multiplicatively — the harsher (minimum) of the two
 * wins. So a 2-jockey race that ran 2.5h grants XP/2 (not XP/4), and any solo
 * race or sub-2-hour race grants nothing regardless of the other factor.
 */
export const RACE_XP_GATE = {
  full_jockeys: 3,
  half_jockeys: 2,
  full_hours: 3,
  half_hours: 2,
} as const;

export function raceXpMultiplier(input: { distinct_jockeys: number; duration_ms: number }): number {
  const jockeyFactor =
    input.distinct_jockeys >= RACE_XP_GATE.full_jockeys ? 1 :
    input.distinct_jockeys >= RACE_XP_GATE.half_jockeys ? 0.5 : 0;
  const hours = input.duration_ms / 3_600_000;
  const durationFactor =
    hours >= RACE_XP_GATE.full_hours ? 1 :
    hours >= RACE_XP_GATE.half_hours ? 0.5 : 0;
  // Non-stacking: the harsher factor governs — never multiply them together.
  return Math.min(jockeyFactor, durationFactor);
}
