import { describe, it, expect } from 'vitest';
import { scoreTick, scoredOf, STAMINA, staminaStep, resolveStaminaConfig, STAMINA_PARAM_BOUNDS, validateStaminaConfig } from '../src/scoring.js';
import type { StaminaConfig } from '../src/scoring.js';

describe('scoreTick — no toggles', () => {
  it('returns the delta unchanged when no mechanic is enabled', () => {
    const r = scoreTick({ delta: 1234, dt_ms: 60_000, race: {}, state: {} });
    expect(r.scored_delta).toBe(1234);
  });

  it('is the identity for a zero delta', () => {
    expect(scoreTick({ delta: 0, dt_ms: 60_000, race: {}, state: {} }).scored_delta).toBe(0);
  });

  it('leaves state untouched when no mechanic is enabled', () => {
    const r = scoreTick({ delta: 500, dt_ms: 30_000, race: {}, state: {} });
    expect(r.state).toEqual({});
  });

  it('is the identity regardless of dt', () => {
    for (const dt_ms of [1_000, 60_000, 7_200_000]) {
      expect(scoreTick({ delta: 999, dt_ms, race: {}, state: {} }).scored_delta).toBe(999);
    }
  });

  it('passes a fractional delta through byte-for-byte, without rounding', () => {
    const r = scoreTick({ delta: 2000.5, dt_ms: 60_000, race: {}, state: {} });
    expect(r.scored_delta).toBe(2000.5);
  });
});

describe('scoredOf', () => {
  it('prefers scored_tokens when present', () => {
    expect(scoredOf({ current_tokens: 10, scored_tokens: 7 })).toBe(7);
  });

  it('falls back to current_tokens when scored_tokens is absent', () => {
    expect(scoredOf({ current_tokens: 10 })).toBe(10);
  });

  it('treats a scored_tokens of 0 as a real value, not absent', () => {
    expect(scoredOf({ current_tokens: 10, scored_tokens: 0 })).toBe(0);
  });
});

const cfg = resolveStaminaConfig({});

describe('staminaStep — multiplier', () => {
  it('is 1 at or above the taper floor', () => {
    expect(staminaStep({ stamina: 100, pace: 0, minutes: 1, cfg }).multiplier).toBe(1);
    expect(staminaStep({ stamina: 25, pace: 0, minutes: 1, cfg }).multiplier).toBe(1);
  });

  it('tapers linearly below the floor, bottoming at TIRED_MULTIPLIER', () => {
    expect(staminaStep({ stamina: 12.5, pace: 0, minutes: 1, cfg }).multiplier).toBeCloseTo(0.75);
    expect(staminaStep({ stamina: 0, pace: 0, minutes: 1, cfg }).multiplier).toBeCloseTo(0.5);
  });
});

describe('staminaStep — drain', () => {
  it('does not drain at or below the sustainable pace', () => {
    expect(staminaStep({ stamina: 50, pace: 4_000, minutes: 1, cfg }).stamina).toBeGreaterThan(50);
  });

  it('drains proportionally to the excess pace', () => {
    // 8,000 = 2x sustainable -> (2 - 1) * 4 = 4 per minute
    expect(staminaStep({ stamina: 100, pace: 8_000, minutes: 1, cfg }).stamina).toBeCloseTo(96);
  });

  it('clamps drain at MAX_DRAIN_PER_MIN', () => {
    // 40,000 = 10x sustainable -> would be 36/min, clamped to 6
    expect(staminaStep({ stamina: 100, pace: 40_000, minutes: 1, cfg }).stamina).toBeCloseTo(94);
  });

  it('never falls below zero', () => {
    expect(staminaStep({ stamina: 2, pace: 40_000, minutes: 10, cfg }).stamina).toBe(0);
  });
});

describe('staminaStep — recovery', () => {
  it('recovers at RECOVER_PER_MIN while under the sustainable pace', () => {
    expect(staminaStep({ stamina: 50, pace: 1_000, minutes: 1, cfg }).stamina).toBeCloseTo(52);
  });

  it('caps recovery credit per tick so a long absence cannot rest the horse', () => {
    // A two-hour gap earns the same as RECOVER_TICK_CAP_MS (90s) of credit: 2 * 1.5 = 3
    expect(staminaStep({ stamina: 50, pace: 0, minutes: 120, cfg }).stamina).toBeCloseTo(53);
  });

  it('never exceeds 100', () => {
    expect(staminaStep({ stamina: 99.5, pace: 0, minutes: 10, cfg }).stamina).toBe(100);
  });
});

describe('scoreTick — stamina enabled', () => {
  it('scores at full rate while fresh and drains', () => {
    const r = scoreTick({
      delta: 8_000, dt_ms: 60_000, race: { stamina: true }, state: { stamina: 100 },
    });
    expect(r.scored_delta).toBe(8_000);          // fresh: full multiplier
    expect(r.state.stamina).toBeCloseTo(96);     // 2x sustainable -> 4/min
  });

  it('tapers the delta once below the floor', () => {
    const r = scoreTick({
      delta: 1_000, dt_ms: 60_000, race: { stamina: true }, state: { stamina: 12.5 },
    });
    expect(r.scored_delta).toBeCloseTo(750);
  });

  it('starts an absent stamina at 100', () => {
    const r = scoreTick({ delta: 100, dt_ms: 60_000, race: { stamina: true }, state: {} });
    expect(r.scored_delta).toBe(100);
    expect(r.state.stamina).toBe(100);
  });

  it('rounds a fractional delta even at full stamina, once the mechanic is on', () => {
    const r = scoreTick({
      delta: 2000.5, dt_ms: 60_000, race: { stamina: true }, state: { stamina: 100 },
    });
    expect(r.scored_delta).toBe(2001);
  });

  it('scales the sustainable pace for counts_input races', () => {
    // 8,000/min is under 4,000 x 10, so it recovers rather than drains
    const r = scoreTick({
      delta: 8_000, dt_ms: 60_000,
      race: { stamina: true, counts_input: true }, state: { stamina: 50 },
    });
    expect(r.state.stamina).toBeCloseTo(52);
  });

  it('ignores stamina entirely when the toggle is off', () => {
    const r = scoreTick({
      delta: 40_000, dt_ms: 60_000, race: {}, state: { stamina: 3 },
    });
    expect(r.scored_delta).toBe(40_000);
    expect(r.state.stamina).toBe(3);
  });

  it('treats a zero dt as a no-op rather than dividing by zero', () => {
    const r = scoreTick({ delta: 500, dt_ms: 0, race: { stamina: true }, state: { stamina: 100 } });
    expect(Number.isFinite(r.scored_delta)).toBe(true);
    expect(r.state.stamina).toBe(100);
  });
});

describe('resolveStaminaConfig', () => {
  it('returns the defaults when no override is stamped', () => {
    expect(resolveStaminaConfig({})).toEqual({
      sustainable_pace: STAMINA.SUSTAINABLE_PACE,
      drain_per_min: STAMINA.DRAIN_PER_MIN,
      max_drain_per_min: STAMINA.MAX_DRAIN_PER_MIN,
      recover_per_min: STAMINA.RECOVER_PER_MIN,
      taper_floor: STAMINA.TAPER_FLOOR,
      tired_multiplier: STAMINA.TIRED_MULTIPLIER,
    });
  });

  it('applies only the named fields of a partial override', () => {
    const r = resolveStaminaConfig({ stamina_config: { drain_per_min: 9 } });
    expect(r.drain_per_min).toBe(9);
    expect(r.sustainable_pace).toBe(STAMINA.SUSTAINABLE_PACE);
  });
});

describe('STAMINA_PARAM_BOUNDS', () => {
  it('declares a default equal to the corresponding STAMINA constant', () => {
    expect(STAMINA_PARAM_BOUNDS.sustainable_pace.default).toBe(STAMINA.SUSTAINABLE_PACE);
    expect(STAMINA_PARAM_BOUNDS.drain_per_min.default).toBe(STAMINA.DRAIN_PER_MIN);
    expect(STAMINA_PARAM_BOUNDS.max_drain_per_min.default).toBe(STAMINA.MAX_DRAIN_PER_MIN);
    expect(STAMINA_PARAM_BOUNDS.recover_per_min.default).toBe(STAMINA.RECOVER_PER_MIN);
    expect(STAMINA_PARAM_BOUNDS.taper_floor.default).toBe(STAMINA.TAPER_FLOOR);
    expect(STAMINA_PARAM_BOUNDS.tired_multiplier.default).toBe(STAMINA.TIRED_MULTIPLIER);
  });
});

describe('validateStaminaConfig', () => {
  it('accepts an empty config', () => {
    expect(validateStaminaConfig({})).toEqual({ ok: true, value: {} });
  });

  it('accepts in-range values', () => {
    expect(validateStaminaConfig({ drain_per_min: 7 })).toEqual({ ok: true, value: { drain_per_min: 7 } });
  });

  it('rejects a value below its minimum', () => {
    const r = validateStaminaConfig({ sustainable_pace: 10 });
    expect(r.ok).toBe(false);
  });

  it('rejects a value above its maximum', () => {
    expect(validateStaminaConfig({ tired_multiplier: 1.5 }).ok).toBe(false);
  });

  it('rejects a non-numeric value', () => {
    expect(validateStaminaConfig({ drain_per_min: 'fast' as unknown as number }).ok).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(validateStaminaConfig({ nonsense: 1 } as unknown as StaminaConfig).ok).toBe(false);
  });

  it('rejects a key inherited from Object.prototype rather than treating it as a bound', () => {
    expect(validateStaminaConfig({ hasOwnProperty: 5 } as unknown as StaminaConfig).ok).toBe(false);
    expect(validateStaminaConfig({ toString: 1 } as unknown as StaminaConfig).ok).toBe(false);
  });

  it('rejects a __proto__ key from parsed JSON instead of silently dropping it', () => {
    const input = JSON.parse('{"__proto__": 5}') as StaminaConfig;
    expect(validateStaminaConfig(input).ok).toBe(false);
  });
});
