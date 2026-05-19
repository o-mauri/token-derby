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

describe('evaluateAchievements — Racer!', () => {
  it('accumulates racer_streak_ms by dt on each tick', () => {
    const prev = emptyState();
    const result = evaluateAchievements(input({
      prev,
      now_ms: 1_000_000,
      last_heartbeat_at_ms: 1_000_000 - 60_000,
    }));
    expect(result.next.racer_streak_ms).toBe(60_000);
    expect(result.xp_delta).toBe(0);
    expect(result.events_this_tick).toEqual([]);
  });

  it('caps single-tick credit at 90 seconds when dt is larger', () => {
    const prev = emptyState();
    const result = evaluateAchievements(input({
      prev,
      now_ms: 1_000_000,
      last_heartbeat_at_ms: 1_000_000 - 300_000,  // 5 min gap
    }));
    expect(result.next.racer_streak_ms).toBe(90_000);
  });

  it('awards Racer! when streak reaches 1 hour, then resets streak to 0', () => {
    const prev = emptyState();
    prev.racer_streak_ms = HOUR_MS - 30_000;  // 30s shy of 1 hour
    const result = evaluateAchievements(input({
      prev,
      now_ms: 2_000_000,
      last_heartbeat_at_ms: 2_000_000 - 60_000,
    }));
    expect(result.next.racer_streak_ms).toBe(0);
    expect(result.next.racer_awards).toBe(1);
    expect(result.xp_delta).toBe(1);
    expect(result.events_this_tick).toEqual([
      { at: 2_000_000, name: 'Racer!', xp: 1 },
    ]);
    expect(result.next.recent_events).toContainEqual({ at: 2_000_000, name: 'Racer!', xp: 1 });
  });

  it('does not award beyond 5 racer_awards cap', () => {
    const prev = emptyState();
    prev.racer_streak_ms = HOUR_MS;
    prev.racer_awards = 5;
    const result = evaluateAchievements(input({ prev }));
    expect(result.xp_delta).toBe(0);
    expect(result.next.racer_awards).toBe(5);
    // Streak still resets so it doesn't bank infinite future credit.
    expect(result.next.racer_streak_ms).toBe(0);
  });
});
