// One set of assertions, run against every modifier. These are the promises the
// pipeline relies on regardless of what a mechanic does; a new modifier that
// breaks one fails here rather than in a live race.

import { describe, it, expect } from 'vitest';
import { MODIFIERS, MODIFIER_IDS } from '../../src/scoring/registry.js';
import { resolveParams, validateParams, type ModifierContext } from '../../src/scoring/modifier.js';
import { zeroPerFamily } from '../../src/models.js';

function contextFor(id: keyof typeof MODIFIERS, over: Partial<ModifierContext> = {}): ModifierContext {
  const modifier = MODIFIERS[id];
  return {
    delta: 1_000,
    components: zeroPerFamily(),
    dt_ms: 60_000,
    now_ms: 1_700_000_000_000,
    horse: { horse_id: 'h1', current_tokens: 0, joined_at: '2026-01-01T00:00:00Z' },
    field: [],
    params: resolveParams(modifier),
    state: {},
    ...over,
  };
}

describe.each(MODIFIER_IDS)('Modifier contract — %s', (id) => {
  const modifier = MODIFIERS[id];

  it('identifies itself with its id, a label and a description', () => {
    expect(modifier.id).toBe(id);
    expect(modifier.label).toMatch(/^\S/);
    expect(modifier.description).toMatch(/\S/);
  });

  it('ships off, so turning a mechanic on is always a decision', () => {
    expect(modifier.enabledByDefault).toBe(false);
  });

  it('declares bounds that contain its own default', () => {
    for (const [key, bound] of Object.entries(modifier.params)) {
      expect(bound.default, key).toBeGreaterThanOrEqual(bound.min);
      expect(bound.default, key).toBeLessThanOrEqual(bound.max);
      expect(bound.step, key).toBeGreaterThan(0);
    }
  });

  it('returns a finite, non-negative multiplier for an ordinary beat', () => {
    const { multiplier } = modifier.apply(contextFor(id));
    expect(Number.isFinite(multiplier)).toBe(true);
    expect(multiplier).toBeGreaterThanOrEqual(0);
  });

  it('survives a zero-length beat without dividing by it', () => {
    const { multiplier } = modifier.apply(contextFor(id, { dt_ms: 0 }));
    expect(Number.isFinite(multiplier)).toBe(true);
  });

  it('survives a zero delta and an enormous one', () => {
    for (const delta of [0, 1e12]) {
      const { multiplier } = modifier.apply(contextFor(id, { delta }));
      expect(Number.isFinite(multiplier), `delta ${delta}`).toBe(true);
      expect(multiplier).toBeGreaterThanOrEqual(0);
    }
  });

  it('starts from its own defaults when no state is stored', () => {
    // A horse's first beat has an empty bag; a modifier must not read undefined.
    const outcome = modifier.apply(contextFor(id, { state: {} }));
    expect(Number.isFinite(outcome.multiplier)).toBe(true);
  });

  it('returns only finite numbers in its state', () => {
    const outcome = modifier.apply(contextFor(id));
    for (const [key, value] of Object.entries(outcome.state ?? {})) {
      expect(Number.isFinite(value), key).toBe(true);
    }
  });

  it('is pure: the same context twice gives the same answer', () => {
    const ctx = contextFor(id);
    expect(modifier.apply(ctx)).toEqual(modifier.apply(ctx));
  });

  it('accepts its own defaults as valid tuning', () => {
    expect(validateParams(modifier, resolveParams(modifier)).ok).toBe(true);
  });

  it('rejects a param it does not declare', () => {
    const result = validateParams(modifier, { nonsense_param: 1 });
    expect(result.ok).toBe(false);
  });

  it('rejects a value outside its declared bounds', () => {
    const [key, bound] = Object.entries(modifier.params)[0]!;
    expect(validateParams(modifier, { [key]: bound.max + bound.step }).ok).toBe(false);
    expect(validateParams(modifier, { [key]: bound.min - bound.step }).ok).toBe(false);
  });

  it('previews without throwing, when it offers one', () => {
    if (!modifier.preview) return;
    for (const row of modifier.preview(resolveParams(modifier))) {
      expect(row.label).toMatch(/\S/);
      expect(row.value).toMatch(/\S/);
    }
  });
});
