/**
 * Horse XP / level curve.
 *
 * The cost (in XP) to advance from level `n` to level `n+1` is given by:
 *
 *     xpForLevel(n) = 2.5 n^3 + 20 n^2 + 50 n − 22.5
 *
 * So the cumulative XP at which a horse becomes each level is:
 *
 *     Level 1 → 0          (every new horse starts here at 0 XP)
 *     Level 2 → xpForLevel(1)  = 50
 *     Level 3 → xpForLevel(2)  = 177.5
 *     Level 4 → xpForLevel(3)  = 375
 *     ...
 *
 * To redesign the curve, edit `xpForLevel` below or bump `MAX_LEVEL`.
 * Levels are derived from XP — they are not stored on the horse, so changing
 * this file re-levels every horse without needing a migration.
 */

export const MAX_LEVEL = 30;

export function xpForLevel(n: number): number {
  return 2.5 * n ** 3 + 20 * n ** 2 + 50 * n - 22.5;
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
