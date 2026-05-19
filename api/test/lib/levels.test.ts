import { describe, it, expect } from 'vitest';
import { XP_THRESHOLDS, MAX_LEVEL, levelFromXp, levelInfo, thresholdForLevel, xpForLevel, xpForRaceResult, xpForTokenBonus, XP_AWARDS } from '@token-derby/shared';

describe('xpForLevel formula', () => {
  it('matches the documented values from 1.8n³ + 18n² + 50n − 19.8', () => {
    expect(xpForLevel(1)).toBe(50);
    expect(xpForLevel(2)).toBeCloseTo(166.6, 4);
    expect(xpForLevel(3)).toBeCloseTo(340.8, 4);
    expect(xpForLevel(4)).toBeCloseTo(583.4, 4);
  });
});

describe('thresholdForLevel', () => {
  it('level 1 always starts at 0', () => {
    expect(thresholdForLevel(1)).toBe(0);
  });

  it('level n (n>1) rounds xpForLevel(n-1) to an integer', () => {
    expect(thresholdForLevel(2)).toBe(50);
    expect(thresholdForLevel(3)).toBe(167); // 166.6 rounded
    expect(thresholdForLevel(4)).toBe(341); // 340.8 rounded
    expect(thresholdForLevel(5)).toBe(583); // 583.4 rounded
  });
});

describe('levelFromXp', () => {
  it('starts every horse at level 1 with 0 XP', () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it('returns the highest level whose threshold is met', () => {
    expect(levelFromXp(49)).toBe(1);
    expect(levelFromXp(50)).toBe(2);
    expect(levelFromXp(166)).toBe(2);
    expect(levelFromXp(167)).toBe(3);
  });

  it('caps at MAX_LEVEL', () => {
    expect(levelFromXp(XP_THRESHOLDS[MAX_LEVEL - 1]!)).toBe(MAX_LEVEL);
    expect(levelFromXp(XP_THRESHOLDS[MAX_LEVEL - 1]! * 1000)).toBe(MAX_LEVEL);
  });

  it('treats negative and fractional xp as floor non-negative', () => {
    expect(levelFromXp(-50)).toBe(1);
    expect(levelFromXp(49.999)).toBe(1);
    expect(levelFromXp(50.5)).toBe(2);
  });
});

describe('levelInfo', () => {
  it('returns 0% progress at the start of a level', () => {
    const info = levelInfo(XP_THRESHOLDS[1]!);
    expect(info.level).toBe(2);
    expect(info.xp_into_level).toBe(0);
    expect(info.progress).toBe(0);
  });

  it('returns near-100% progress one XP shy of the next level', () => {
    const info = levelInfo(XP_THRESHOLDS[2]! - 1);
    expect(info.level).toBe(2);
    expect(info.xp_into_level).toBe(XP_THRESHOLDS[2]! - 1 - XP_THRESHOLDS[1]!);
    expect(info.progress).toBeLessThan(1);
    expect(info.progress).toBeGreaterThan(0.9);
  });

  it('reports next_level_xp = null at max level', () => {
    const info = levelInfo(XP_THRESHOLDS[MAX_LEVEL - 1]! + 999);
    expect(info.level).toBe(MAX_LEVEL);
    expect(info.next_level_xp).toBeNull();
    expect(info.xp_for_level).toBeNull();
    expect(info.progress).toBe(1);
  });

  it('mid-level progress matches expectation', () => {
    // halfway between level 1 (0) and level 2 (50)
    const info = levelInfo(25);
    expect(info.level).toBe(1);
    expect(info.xp_into_level).toBe(25);
    expect(info.xp_for_level).toBe(50);
    expect(info.progress).toBeCloseTo(0.5);
  });
});

describe('xpForRaceResult', () => {
  it('winner gets compete + podium + winner', () => {
    expect(xpForRaceResult(1)).toBe(XP_AWARDS.compete + XP_AWARDS.podium + XP_AWARDS.winner);
    expect(xpForRaceResult(1)).toBe(80);
  });

  it('runner-up gets compete + podium + runner_up', () => {
    expect(xpForRaceResult(2)).toBe(XP_AWARDS.compete + XP_AWARDS.podium + XP_AWARDS.runner_up);
    expect(xpForRaceResult(2)).toBe(65);
  });

  it('third place gets compete + podium only', () => {
    expect(xpForRaceResult(3)).toBe(XP_AWARDS.compete + XP_AWARDS.podium);
    expect(xpForRaceResult(3)).toBe(50);
  });

  it('fourth and beyond get compete only', () => {
    expect(xpForRaceResult(4)).toBe(XP_AWARDS.compete);
    expect(xpForRaceResult(10)).toBe(XP_AWARDS.compete);
    expect(xpForRaceResult(100)).toBe(XP_AWARDS.compete);
  });
});

describe('xpForTokenBonus', () => {
  it('winner always gets the full bonus (flat 15) regardless of token ratio', () => {
    expect(xpForTokenBonus(1, 1000, 1000)).toBe(XP_AWARDS.token_bonus_max);
    expect(xpForTokenBonus(1, 0, 0)).toBe(XP_AWARDS.token_bonus_max);
    expect(xpForTokenBonus(1, 1, 1)).toBe(XP_AWARDS.token_bonus_max);
  });

  it('non-winners get round(tokens / winner_tokens * 15)', () => {
    expect(xpForTokenBonus(2, 1000, 1000)).toBe(15);     // tied on tokens → full bonus
    expect(xpForTokenBonus(2, 800, 1000)).toBe(12);      // 800/1000*15 = 12
    expect(xpForTokenBonus(2, 500, 1000)).toBe(8);       // 7.5 rounds to 8
    expect(xpForTokenBonus(2, 100, 1000)).toBe(2);       // 1.5 rounds to 2
    expect(xpForTokenBonus(2, 0, 1000)).toBe(0);
  });

  it('returns 0 for non-winners when winner has 0 tokens (degenerate race)', () => {
    expect(xpForTokenBonus(2, 0, 0)).toBe(0);
    expect(xpForTokenBonus(5, 0, 0)).toBe(0);
  });

  it('caps at the full bonus if tokens somehow exceed winner_tokens', () => {
    expect(xpForTokenBonus(2, 9999, 100)).toBe(15);
  });
});
