// The stamina model's own arithmetic, exercised through the function the race
// and the settings preview both call, so neither can drift from the other.

import { describe, it, expect } from 'vitest';
import { staminaStep, FULL_STAMINA, type StaminaParams } from '../../src/scoring/modifiers/stamina.js';
import { resolveParams } from '../../src/scoring/modifier.js';
import { MODIFIERS } from '../../src/scoring/registry.js';

const params = resolveParams(MODIFIERS.stamina) as StaminaParams;
const step = (level: number, pace: number, minutes: number) => staminaStep({ level, pace, minutes, params });

describe('staminaStep — multiplier', () => {
  it('is 1 at or above the taper floor', () => {
    expect(step(100, 0, 1).multiplier).toBe(1);
    expect(step(params.taper_floor, 0, 1).multiplier).toBe(1);
  });

  it('tapers linearly below the floor, bottoming at tired_multiplier', () => {
    expect(step(params.taper_floor / 2, 0, 1).multiplier).toBeCloseTo(0.75);
    expect(step(0, 0, 1).multiplier).toBeCloseTo(params.tired_multiplier);
  });
});

describe('staminaStep — drain', () => {
  it('does not drain at or below the sustainable pace', () => {
    expect(step(50, params.sustainable_pace, 1).level).toBeGreaterThan(50);
  });

  it('drains proportionally to the excess pace', () => {
    expect(step(100, params.sustainable_pace * 2, 1).level).toBeCloseTo(96);
  });

  it('clamps drain at max_drain_per_min', () => {
    expect(step(100, params.sustainable_pace * 10, 1).level).toBeCloseTo(94);
  });

  it('never falls below zero', () => {
    expect(step(2, params.sustainable_pace * 10, 10).level).toBe(0);
  });
});

describe('staminaStep — recovery', () => {
  it('recovers at recover_per_min while under the sustainable pace', () => {
    expect(step(50, params.sustainable_pace / 4, 1).level).toBeCloseTo(52);
  });

  it('caps recovery credit per tick so a long absence cannot rest the horse', () => {
    // 120 minutes away earns the same 90s of credit as an ordinary gap.
    expect(step(50, 0, 120).level).toBeCloseTo(53);
  });

  it('never exceeds full', () => {
    expect(step(FULL_STAMINA - 0.5, 0, 10).level).toBe(FULL_STAMINA);
  });
});
