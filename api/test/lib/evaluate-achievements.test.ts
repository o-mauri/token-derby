import { describe, it, expect } from 'vitest';
import { evaluateAchievements, type AchievementState, type EvaluateInput } from '../../src/lib/evaluate-achievements.js';

const HOUR_MS = 3_600_000;

function emptyState(): AchievementState {
  return {
    live_xp: 0,
    last_rank: undefined,
    racer_streak_ms: 0,
    racer_awards: 0,
    pacesetter_streak_ms: 0,
    pacesetter_awards: 0,
    overtake_awards: 0,
    lead_take_awards: 0,
    last_stampede_at: undefined,
    was_in_last: false,
    comeback_awarded: false,
    last_gap_in_1st: undefined,
    last_pulled_away_at: undefined,
    recent_events: [],
  };
}

function input(overrides: Partial<EvaluateInput>): EvaluateInput {
  return {
    prev: emptyState(),
    now_ms: 1_000_000,
    last_heartbeat_at_ms: 1_000_000 - 60_000,
    current_tokens: 0,
    prev_current_tokens: 0,
    new_rank: 1,
    total_horses: 4,
    second_place_tokens: null,
    warm_up_active: false,
    ...overrides,
  };
}

describe('evaluateAchievements — warm-up gate', () => {
  it('returns prev state unchanged when warm-up is active', () => {
    const prev = emptyState();
    prev.racer_streak_ms = 999;  // pollute to make sure nothing is touched
    const result = evaluateAchievements(input({ prev, warm_up_active: true }));
    expect(result.xp_delta).toBe(0);
    expect(result.events_this_tick).toEqual([]);
    expect(result.next).toEqual(prev);  // bit-for-bit identical
  });
});
