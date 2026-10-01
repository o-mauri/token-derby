import { describe, it, expect } from 'vitest';
import { projectionTable, projectionFrom, projectedMultiplier, PROJECTION_STEP_MINUTES } from '../../src/scoring/projection.js';
import type { ActiveModifier } from '../../src/scoring/engine.js';
import type { Modifier } from '../../src/scoring/modifier.js';

const fake = (id: string, project?: Modifier['project']): ActiveModifier => ({
  modifier: { id: id as any, label: id, description: id, enabledByDefault: false, params: {}, apply: () => ({ multiplier: 1 }), ...(project ? { project } : {}) },
  params: {},
  state: {},
});
const flat = (m: number | Partial<Record<'anthropic' | 'openai' | 'google', number>>) =>
  (({ steps }: { steps: number }) => Array.from({ length: steps }, () => m)) as NonNullable<Modifier['project']>;

describe('projectionTable', () => {
  it('is a single 1 when the race runs no modifiers', () => {
    expect(Array.from(projectionTable({ race: {}, modifier_states: {}, pace: 5000, maxMinutes: 300, fallbackRatio: 0.7 }))).toEqual([1]);
  });
  it('runs stamina when the race turns it on', () => {
    const t = projectionTable({
      race: { modifiers: { stamina: { enabled: true, params: {} } } },
      modifier_states: { stamina: { level: 10 } }, pace: 5000, maxMinutes: 120, fallbackRatio: 1,
    });
    expect(t.length).toBe(120 / PROJECTION_STEP_MINUTES + 1);
    expect(t[0]!).toBeLessThan(1);
  });
});

describe('projectionFrom', () => {
  const base = { pace: 1000, maxMinutes: 60, fallbackRatio: 0.4 };

  it('folds whole-beat multipliers as a product', () => {
    const t = projectionFrom([fake('a', flat(0.5)), fake('b', flat(0.8))], base);
    expect(t[3]!).toBeCloseTo(0.4, 6);
  });
  it('weights per-family multipliers by the horse\'s family shares', () => {
    const t = projectionFrom(
      [fake('a', flat({ anthropic: 2 })), fake('b', flat({ openai: 3 }))],
      { ...base, model_tokens: { anthropic: 750, openai: 250, google: 0 } },
    );
    // 0.75 × 2 + 0.25 × 3
    expect(t[0]!).toBeCloseTo(2.25, 6);
  });
  it('treats a horse with no family split as all anthropic', () => {
    const t = projectionFrom([fake('a', flat({ openai: 3 }))], base);
    expect(t[0]!).toBeCloseTo(1, 6);
  });
  it('ignores broken multipliers the way the engine does', () => {
    const t = projectionFrom([fake('a', flat(Number.NaN)), fake('b', flat(-2))], base);
    expect(t[0]!).toBe(1);
  });
  it('uses the observed ratio for every step when any modifier has no projection', () => {
    const t = projectionFrom([fake('a', flat(0.5)), fake('b')], base);
    expect(Array.from(t).every((v) => Math.abs(v - 0.4) < 1e-6)).toBe(true);
  });
});

describe('projection speed', () => {
  it('builds 50 stamina tables over a 12-hour run-in in under 150 ms', () => {
    const race = { modifiers: { stamina: { enabled: true, params: {} } } };
    projectionTable({ race, modifier_states: {}, pace: 60_000, maxMinutes: 720, fallbackRatio: 1 });
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) {
      projectionTable({ race, modifier_states: { stamina: { level: 30 + i } }, pace: 30_000 + i * 1000, maxMinutes: 720, fallbackRatio: 1 });
    }
    expect(performance.now() - t0).toBeLessThan(150);
  });
});

describe('projectedMultiplier', () => {
  it('rounds active minutes to the nearest step and clamps to the table', () => {
    const t = Float32Array.from([1, 0.9, 0.8]);
    expect(projectedMultiplier(t, 0)).toBe(1);
    expect(projectedMultiplier(t, 8)).toBeCloseTo(0.9, 6);
    expect(projectedMultiplier(t, 500)).toBeCloseTo(0.8, 6);
  });
});
