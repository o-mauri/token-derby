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

  const next: AchievementState = { ...inp.prev, recent_events: [...inp.prev.recent_events] };
  const events: RecentEvent[] = [];
  let xpDelta = 0;

  const dt = Math.max(0, inp.now_ms - inp.last_heartbeat_at_ms);

  // Racer!
  next.racer_streak_ms = inp.prev.racer_streak_ms + Math.min(dt, MIDRACE_THRESHOLDS.racer_dt_cap_ms);
  if (next.racer_streak_ms >= MIDRACE_THRESHOLDS.streak_hour_ms) {
    if (next.racer_awards < MIDRACE_CAPS.racer_awards) {
      const event: RecentEvent = { at: inp.now_ms, name: 'Racer!', xp: MIDRACE_XP.racer };
      events.push(event);
      next.recent_events.push(event);
      xpDelta += MIDRACE_XP.racer;
      next.racer_awards += 1;
    }
    next.racer_streak_ms = 0;
  }

  next.live_xp = inp.prev.live_xp + xpDelta;
  return { next, xp_delta: xpDelta, events_this_tick: events };
}
