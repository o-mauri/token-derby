import { describe, it, expect } from 'vitest';
import { stamina, staminaStep, FULL_STAMINA, type StaminaParams } from '../../src/scoring/modifiers/stamina.js';
import { resolveParams } from '../../src/scoring/modifier.js';

const params = resolveParams(stamina, {}) as unknown as StaminaParams;
const curve = (level: number, pace: number, steps = 41) =>
  stamina.project!({ state: { level }, params: params as unknown as Record<string, number>, pace, stepMinutes: 6, steps }) as number[];

describe('stamina.project', () => {
  it('returns one entry per step', () => {
    expect(curve(FULL_STAMINA, 10_000)).toHaveLength(41);
  });
  it('stays at 1 for a fresh horse below the sustainable pace', () => {
    expect(curve(FULL_STAMINA, 10_000).every((m) => m === 1)).toBe(true);
  });
  it('is below 1 from the first step for a horse already under the taper floor', () => {
    const c = curve(10, 10_000);
    expect(c[0]!).toBeLessThan(1);
    expect(c[0]!).toBe(staminaStep({ level: 10, pace: 10_000, minutes: 1, params }).multiplier);
  });
  it('declines over time for a horse running well above the sustainable pace', () => {
    const c = curve(FULL_STAMINA, 120_000);
    expect(c[1]!).toBe(1);
    expect(c[40]!).toBeLessThan(c[10]!);
    expect(c[40]!).toBeGreaterThanOrEqual(params.tired_multiplier);
  });
});
