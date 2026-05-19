import type { AchievementName, RecentEvent } from '@token-derby/shared';
import { MIDRACE_XP, MIDRACE_CAPS, MIDRACE_THRESHOLDS, overtakeDescription } from '@token-derby/shared';

export type AchievementState = {
  live_xp: number;
  last_rank: number | undefined;
  racer_streak_ms: number;
  racer_awards: number;
  pacesetter_streak_ms: number;
  pacesetter_awards: number;
  overtake_awards: number;
  lead_take_awards: number;
  last_stampede_at: number | undefined;
  was_in_last: boolean;
  comeback_awarded: boolean;
  last_gap_in_1st: number | undefined;
  last_pulled_away_at: number | undefined;
  recent_events: RecentEvent[];
};

export type EvaluateInput = {
  prev: AchievementState;
  now_ms: number;
  last_heartbeat_at_ms: number;
  current_tokens: number;
  prev_current_tokens: number;
  new_rank: number;
  total_horses: number;
  second_place_tokens: number | null;
  warm_up_active: boolean;
};

export type EvaluateOutput = {
  next: AchievementState;
  xp_delta: number;
  events_this_tick: RecentEvent[];
};

export function evaluateAchievements(inp: EvaluateInput): EvaluateOutput {
  if (inp.warm_up_active) {
    return { next: inp.prev, xp_delta: 0, events_this_tick: [] };
  }
  // To be implemented in later steps.
  return { next: inp.prev, xp_delta: 0, events_this_tick: [] };
}
