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
    counts_input: false,
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

describe('evaluateAchievements — Took the lead!', () => {
  it('fires +5 XP when prev rank > 1 and new rank is 1', () => {
    const prev = emptyState();
    prev.last_rank = 2;
    const result = evaluateAchievements(input({ prev, new_rank: 1 }));
    expect(result.xp_delta).toBe(5);
    expect(result.events_this_tick).toContainEqual({
      at: expect.any(Number), name: 'Took the lead!', xp: 5,
    });
    expect(result.next.lead_take_awards).toBe(1);
  });

  it('does not fire when staying in 1st (prev rank already 1)', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    const result = evaluateAchievements(input({ prev, new_rank: 1 }));
    expect(result.events_this_tick.find(e => e.name === 'Took the lead!')).toBeUndefined();
  });

  it('respects cap of 3 lead-takes per race', () => {
    const prev = emptyState();
    prev.last_rank = 2;
    prev.lead_take_awards = 3;
    const result = evaluateAchievements(input({ prev, new_rank: 1 }));
    expect(result.events_this_tick.find(e => e.name === 'Took the lead!')).toBeUndefined();
  });
});

describe('evaluateAchievements — Overtake!', () => {
  it('awards +3 per position climbed when not taking the lead', () => {
    const prev = emptyState();
    prev.last_rank = 5;
    const result = evaluateAchievements(input({ prev, new_rank: 3 }));
    // 5 -> 3 = 2 positions
    expect(result.xp_delta).toBe(6);
    expect(result.events_this_tick).toContainEqual({
      at: expect.any(Number), name: 'Overtake!', xp: 6,
    });
    expect(result.next.overtake_awards).toBe(2);
  });

  it('subtracts the 2->1 climb when Took the lead! also fires (5->1 = +5 lead + 9 overtake)', () => {
    const prev = emptyState();
    prev.last_rank = 5;
    const result = evaluateAchievements(input({ prev, new_rank: 1 }));
    // Lead-take consumes the 2->1 step. Remaining 3 positions = +9 overtake.
    expect(result.xp_delta).toBe(5 + 9);
    expect(result.events_this_tick.find(e => e.name === 'Took the lead!')?.xp).toBe(5);
    expect(result.events_this_tick.find(e => e.name === 'Overtake!')?.xp).toBe(9);
  });

  it('respects overtake_awards cap of 5', () => {
    const prev = emptyState();
    prev.last_rank = 10;
    prev.overtake_awards = 4;
    const result = evaluateAchievements(input({ prev, new_rank: 3, total_horses: 10 }));
    // 10 -> 3 = 7 positions, but only 1 slot remaining -> +3 XP.
    expect(result.events_this_tick.find(e => e.name === 'Overtake!')?.xp).toBe(3);
    expect(result.next.overtake_awards).toBe(5);
  });

  it('does not fire on first heartbeat (last_rank undefined)', () => {
    const prev = emptyState();
    prev.last_rank = undefined;
    const result = evaluateAchievements(input({ prev, new_rank: 1 }));
    expect(result.events_this_tick.find(e => e.name === 'Overtake!')).toBeUndefined();
    expect(result.events_this_tick.find(e => e.name === 'Took the lead!')).toBeUndefined();
  });
});

describe('evaluateAchievements — Pacesetter!', () => {
  it('accumulates streak while in 1st', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    prev.pacesetter_streak_ms = 30_000;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      now_ms: 1_000_000,
      last_heartbeat_at_ms: 1_000_000 - 60_000,
    }));
    expect(result.next.pacesetter_streak_ms).toBe(30_000 + 60_000);
  });

  it('resets streak to 0 when dropping from 1st', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    prev.pacesetter_streak_ms = 600_000;
    const result = evaluateAchievements(input({ prev, new_rank: 2 }));
    expect(result.next.pacesetter_streak_ms).toBe(0);
  });

  it('starts streak fresh at dt when Took the lead! just fired', () => {
    const prev = emptyState();
    prev.last_rank = 3;
    prev.pacesetter_streak_ms = 0;  // wasn't in 1st before
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      now_ms: 1_000_000,
      last_heartbeat_at_ms: 1_000_000 - 60_000,
    }));
    expect(result.next.pacesetter_streak_ms).toBe(60_000);
  });

  it('awards Pacesetter! at 1 hour streak and resets streak', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    prev.pacesetter_streak_ms = HOUR_MS - 30_000;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      now_ms: 2_000_000,
      last_heartbeat_at_ms: 2_000_000 - 60_000,
    }));
    expect(result.next.pacesetter_streak_ms).toBe(0);
    expect(result.next.pacesetter_awards).toBe(1);
    expect(result.events_this_tick).toContainEqual({
      at: 2_000_000, name: 'Pacesetter!', xp: 3,
    });
  });

  it('respects pacesetter_awards cap of 3', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    prev.pacesetter_streak_ms = HOUR_MS;
    prev.pacesetter_awards = 3;
    const result = evaluateAchievements(input({ prev, new_rank: 1 }));
    expect(result.events_this_tick.find(e => e.name === 'Pacesetter!')).toBeUndefined();
    expect(result.next.pacesetter_awards).toBe(3);
  });
});

describe('evaluateAchievements — Stampede!', () => {
  it('fires when current_tokens grows by 7000+ since prev tick', () => {
    const prev = emptyState();
    const result = evaluateAchievements(input({
      prev,
      current_tokens: 10_000,
      prev_current_tokens: 2_500,
      now_ms: 1_000_000,
    }));
    expect(result.xp_delta).toBeGreaterThanOrEqual(2);
    expect(result.events_this_tick).toContainEqual({
      at: 1_000_000, name: 'Stampede!', xp: 2,
    });
    expect(result.next.last_stampede_at).toBe(1_000_000);
  });

  it('does not fire when token gain is exactly 6999', () => {
    const prev = emptyState();
    const result = evaluateAchievements(input({
      prev,
      current_tokens: 7_999,
      prev_current_tokens: 1_000,  // gain = 6999
    }));
    expect(result.events_this_tick.find(e => e.name === 'Stampede!')).toBeUndefined();
  });

  it('fires when token gain is exactly 7000', () => {
    const prev = emptyState();
    const result = evaluateAchievements(input({
      prev,
      current_tokens: 8_000,
      prev_current_tokens: 1_000,  // gain = 7000 exactly
    }));
    expect(result.events_this_tick.find(e => e.name === 'Stampede!')).toBeDefined();
  });

  it('respects 2-hour cooldown', () => {
    const prev = emptyState();
    prev.last_stampede_at = 1_000_000;
    const result = evaluateAchievements(input({
      prev,
      now_ms: 1_000_000 + 60 * 60 * 1000,  // 1 hour later
      current_tokens: 20_000,
      prev_current_tokens: 10_000,
    }));
    expect(result.events_this_tick.find(e => e.name === 'Stampede!')).toBeUndefined();
  });

  it('fires again after cooldown elapses', () => {
    const prev = emptyState();
    prev.last_stampede_at = 1_000_000;
    const result = evaluateAchievements(input({
      prev,
      now_ms: 1_000_000 + 2 * 60 * 60 * 1000 + 1,
      current_tokens: 20_000,
      prev_current_tokens: 10_000,
    }));
    expect(result.events_this_tick.find(e => e.name === 'Stampede!')).toBeDefined();
  });

  it('does NOT fire at 7,000 gain when counts_input is true (threshold scales 10x → 70,000)', () => {
    const prev = emptyState();
    const result = evaluateAchievements(input({
      prev,
      current_tokens: 8_000,
      prev_current_tokens: 1_000,  // gain = 7000
      counts_input: true,
    }));
    expect(result.events_this_tick.find(e => e.name === 'Stampede!')).toBeUndefined();
  });

  it('fires at 70,000 gain when counts_input is true', () => {
    const prev = emptyState();
    const result = evaluateAchievements(input({
      prev,
      current_tokens: 80_000,
      prev_current_tokens: 10_000,  // gain = 70_000
      counts_input: true,
    }));
    expect(result.events_this_tick.find(e => e.name === 'Stampede!')).toBeDefined();
  });
});

describe('evaluateAchievements — Comeback!', () => {
  it('records was_in_last when the horse is at rank == total_horses', () => {
    const prev = emptyState();
    const result = evaluateAchievements(input({
      prev,
      new_rank: 4,
      total_horses: 4,
    }));
    expect(result.next.was_in_last).toBe(true);
  });

  it('fires when was_in_last and new_rank is in the top half (4-horse race: top half = ranks 1-2)', () => {
    const prev = emptyState();
    prev.was_in_last = true;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 2,
      total_horses: 4,
    }));
    expect(result.events_this_tick).toContainEqual({
      at: expect.any(Number), name: 'Comeback!', xp: 5,
    });
    expect(result.next.comeback_awarded).toBe(true);
  });

  it('does not fire twice in the same race', () => {
    const prev = emptyState();
    prev.was_in_last = true;
    prev.comeback_awarded = true;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      total_horses: 4,
    }));
    expect(result.events_this_tick.find(e => e.name === 'Comeback!')).toBeUndefined();
  });

  it('does not fire in solo races (total_horses < 2)', () => {
    const prev = emptyState();
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      total_horses: 1,
    }));
    expect(result.events_this_tick.find(e => e.name === 'Comeback!')).toBeUndefined();
    // was_in_last is also not set in a solo race
    expect(result.next.was_in_last).toBe(false);
  });

  it('does not fire when never having been in last', () => {
    const prev = emptyState();
    prev.was_in_last = false;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      total_horses: 4,
    }));
    expect(result.events_this_tick.find(e => e.name === 'Comeback!')).toBeUndefined();
  });
});

describe('evaluateAchievements — Pulled Away!', () => {
  it('records last_gap_in_1st while in 1st', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      current_tokens: 50_000,
      second_place_tokens: 45_000,
    }));
    expect(result.next.last_gap_in_1st).toBe(5_000);
  });

  it('clears last_gap_in_1st when not in 1st', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    prev.last_gap_in_1st = 5_000;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 2,
    }));
    expect(result.next.last_gap_in_1st).toBeUndefined();
  });

  it('fires when gap grows by 5000+ since previous tick', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    prev.last_gap_in_1st = 1_000;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      current_tokens: 100_000,
      second_place_tokens: 90_000,  // gap now 10_000, growth 9_000
      now_ms: 1_000_000,
    }));
    expect(result.events_this_tick).toContainEqual({
      at: 1_000_000, name: 'Pulled Away!', xp: 3,
    });
    expect(result.next.last_pulled_away_at).toBe(1_000_000);
    expect(result.next.last_gap_in_1st).toBe(10_000);
  });

  it('does not fire below the 5000 growth threshold', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    prev.last_gap_in_1st = 1_000;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      current_tokens: 100_000,
      second_place_tokens: 95_500,  // gap 4_500, growth 3_500
    }));
    expect(result.events_this_tick.find(e => e.name === 'Pulled Away!')).toBeUndefined();
  });

  it('respects 2-hour cooldown', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    prev.last_gap_in_1st = 1_000;
    prev.last_pulled_away_at = 1_000_000;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      current_tokens: 100_000,
      second_place_tokens: 80_000,
      now_ms: 1_000_000 + 60 * 60 * 1000,
    }));
    expect(result.events_this_tick.find(e => e.name === 'Pulled Away!')).toBeUndefined();
  });

  it('does not fire on first heartbeat in 1st (no prev gap to compare)', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    prev.last_gap_in_1st = undefined;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      current_tokens: 100_000,
      second_place_tokens: 50_000,
    }));
    expect(result.events_this_tick.find(e => e.name === 'Pulled Away!')).toBeUndefined();
    expect(result.next.last_gap_in_1st).toBe(50_000);
  });

  it('does NOT fire at 5,000 growth when counts_input is true (threshold scales 10x → 50,000)', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    prev.last_gap_in_1st = 1_000;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      current_tokens: 100_000,
      second_place_tokens: 94_000,  // gap 6_000, growth 5_000
      counts_input: true,
    }));
    expect(result.events_this_tick.find(e => e.name === 'Pulled Away!')).toBeUndefined();
  });

  it('fires at 50,000 growth when counts_input is true', () => {
    const prev = emptyState();
    prev.last_rank = 1;
    prev.last_gap_in_1st = 1_000;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,
      current_tokens: 200_000,
      second_place_tokens: 149_000,  // gap 51_000, growth 50_000
      counts_input: true,
    }));
    expect(result.events_this_tick.find(e => e.name === 'Pulled Away!')).toBeDefined();
  });
});

describe('evaluateAchievements — bookkeeping', () => {
  it('updates last_rank to new_rank on every (non-warm-up) tick', () => {
    const prev = emptyState();
    prev.last_rank = 5;
    const result = evaluateAchievements(input({ prev, new_rank: 3 }));
    expect(result.next.last_rank).toBe(3);
  });

  it('accumulates live_xp across multiple events in one tick', () => {
    const prev = emptyState();
    prev.last_rank = 4;
    prev.racer_streak_ms = HOUR_MS - 30_000;
    const result = evaluateAchievements(input({
      prev,
      new_rank: 1,  // triggers Took the lead! (+5) + Overtake! 2 positions (+6)
      now_ms: 1_000_000,
      last_heartbeat_at_ms: 1_000_000 - 60_000,  // also pushes Racer! over (+1)
    }));
    expect(result.xp_delta).toBe(5 + 6 + 1);
    expect(result.next.live_xp).toBe(prev.live_xp + 5 + 6 + 1);
  });

  it('prunes recent_events entries older than 90 seconds', () => {
    const prev = emptyState();
    prev.recent_events = [
      { at: 1_000_000 - 100_000, name: 'Racer!', xp: 1 },         // older than 90s, should be pruned
      { at: 1_000_000 - 80_000, name: 'Overtake!', xp: 3 },       // within 90s, keep
    ];
    const result = evaluateAchievements(input({
      prev,
      now_ms: 1_000_000,
    }));
    expect(result.next.recent_events).toEqual([
      { at: 1_000_000 - 80_000, name: 'Overtake!', xp: 3 },
    ]);
  });
});
