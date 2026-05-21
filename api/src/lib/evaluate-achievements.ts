import type { RecentEvent } from '@token-derby/shared';
import { MIDRACE_XP, MIDRACE_CAPS, MIDRACE_THRESHOLDS, tokenMultiplier } from '@token-derby/shared';

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
  counts_input: boolean;
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
  const m = tokenMultiplier({ counts_input: inp.counts_input });
  const stampedeThreshold = MIDRACE_THRESHOLDS.stampede_tokens * m;
  const pulledAwayThreshold = MIDRACE_THRESHOLDS.pulled_away_gap * m;

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

  // Took the lead! — must run before Overtake!; consumes the 2->1 step.
  const prevRank = inp.prev.last_rank;
  let leadTook = false;
  if (
    prevRank !== undefined &&
    prevRank > 1 &&
    inp.new_rank === 1 &&
    next.lead_take_awards < MIDRACE_CAPS.lead_take_awards
  ) {
    const event: RecentEvent = { at: inp.now_ms, name: 'Took the lead!', xp: MIDRACE_XP.took_lead };
    events.push(event);
    next.recent_events.push(event);
    xpDelta += MIDRACE_XP.took_lead;
    next.lead_take_awards += 1;
    leadTook = true;
  }

  // Overtake! — positions climbed since last tick, minus the 2->1 step if leadTook.
  if (prevRank !== undefined) {
    const positionsClimbed = Math.max(0, prevRank - inp.new_rank);
    const countable = Math.max(0, positionsClimbed - (leadTook ? 1 : 0));
    const slots = MIDRACE_CAPS.overtake_awards - next.overtake_awards;
    const overtakes = Math.min(countable, slots);
    if (overtakes > 0) {
      const xp = MIDRACE_XP.overtake * overtakes;
      const event: RecentEvent = { at: inp.now_ms, name: 'Overtake!', xp };
      events.push(event);
      next.recent_events.push(event);
      xpDelta += xp;
      next.overtake_awards += overtakes;
    }
  }

  // Pacesetter! — continuous time in 1st.
  if (inp.new_rank === 1) {
    next.pacesetter_streak_ms = leadTook
      ? dt
      : inp.prev.pacesetter_streak_ms + dt;
    if (next.pacesetter_streak_ms >= MIDRACE_THRESHOLDS.streak_hour_ms) {
      if (next.pacesetter_awards < MIDRACE_CAPS.pacesetter_awards) {
        const event: RecentEvent = { at: inp.now_ms, name: 'Pacesetter!', xp: MIDRACE_XP.pacesetter };
        events.push(event);
        next.recent_events.push(event);
        xpDelta += MIDRACE_XP.pacesetter;
        next.pacesetter_awards += 1;
      }
      next.pacesetter_streak_ms = 0;
    }
  } else {
    next.pacesetter_streak_ms = 0;
  }

  // Stampede! — token gain >= 7000 since previous tick + 2h cooldown.
  const tokenGain = inp.current_tokens - inp.prev_current_tokens;
  const stampedeOk =
    inp.prev.last_stampede_at === undefined ||
    inp.now_ms - inp.prev.last_stampede_at >= MIDRACE_THRESHOLDS.stampede_cooldown_ms;
  if (tokenGain >= stampedeThreshold && stampedeOk) {
    const event: RecentEvent = { at: inp.now_ms, name: 'Stampede!', xp: MIDRACE_XP.stampede };
    events.push(event);
    next.recent_events.push(event);
    xpDelta += MIDRACE_XP.stampede;
    next.last_stampede_at = inp.now_ms;
  }

  // Comeback! — was-in-last + currently in top half. Solo race excluded.
  if (inp.total_horses >= 2) {
    if (inp.new_rank === inp.total_horses) next.was_in_last = true;
    const topHalf = Math.ceil(inp.total_horses / 2);
    if (next.was_in_last && !next.comeback_awarded && inp.new_rank <= topHalf) {
      const event: RecentEvent = { at: inp.now_ms, name: 'Comeback!', xp: MIDRACE_XP.comeback };
      events.push(event);
      next.recent_events.push(event);
      xpDelta += MIDRACE_XP.comeback;
      next.comeback_awarded = true;
    }
  }

  // Pulled Away! — gap-over-2nd growth >= 5000 since previous tick in 1st + 2h cooldown.
  if (inp.new_rank === 1) {
    const second = inp.second_place_tokens ?? inp.current_tokens;
    const gap = inp.current_tokens - second;
    if (inp.prev.last_gap_in_1st !== undefined) {
      const growth = gap - inp.prev.last_gap_in_1st;
      const cooldownOk =
        inp.prev.last_pulled_away_at === undefined ||
        inp.now_ms - inp.prev.last_pulled_away_at >= MIDRACE_THRESHOLDS.pulled_away_cooldown_ms;
      if (growth >= pulledAwayThreshold && cooldownOk) {
        const event: RecentEvent = { at: inp.now_ms, name: 'Pulled Away!', xp: MIDRACE_XP.pulled_away };
        events.push(event);
        next.recent_events.push(event);
        xpDelta += MIDRACE_XP.pulled_away;
        next.last_pulled_away_at = inp.now_ms;
      }
    }
    next.last_gap_in_1st = gap;
  } else {
    next.last_gap_in_1st = undefined;
  }

  next.last_rank = inp.new_rank;
  next.live_xp = inp.prev.live_xp + xpDelta;
  next.recent_events = next.recent_events.filter(
    e => inp.now_ms - e.at <= MIDRACE_THRESHOLDS.recent_events_retention_ms,
  );
  return { next, xp_delta: xpDelta, events_this_tick: events };
}
