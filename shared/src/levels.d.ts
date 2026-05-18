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
export declare const MAX_LEVEL = 30;
export declare function xpForLevel(n: number): number;
/**
 * Cumulative XP at which a horse first becomes `level`. Level 1 is the
 * starting state, so its threshold is 0.
 */
export declare function thresholdForLevel(level: number): number;
/**
 * Convenience: total XP thresholds for each level, in order.
 * `XP_THRESHOLDS[i]` is the cumulative XP needed to be level `i+1`.
 */
export declare const XP_THRESHOLDS: readonly number[];
export type LevelInfo = {
    level: number;
    xp: number;
    level_start_xp: number;
    next_level_xp: number | null;
    xp_into_level: number;
    xp_for_level: number | null;
    progress: number;
};
export declare function levelFromXp(xp: number): number;
export declare function levelInfo(xp: number): LevelInfo;
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
export declare const XP_AWARDS: {
    readonly compete: 25;
    readonly podium: 25;
    readonly runner_up: 15;
    readonly winner: 30;
    readonly token_bonus_max: 15;
};
export declare function xpForRaceResult(rank: number): number;
/**
 * Token-proportional XP bonus, layered on top of {@link xpForRaceResult}.
 *   Winner always gets the full `token_bonus_max` (15).
 *   Everyone else gets `round(tokens / winner_tokens * token_bonus_max)`.
 * Falls back to 0 if `winner_tokens` is non-positive (degenerate race).
 */
export declare function xpForTokenBonus(rank: number, tokens: number, winner_tokens: number): number;
