// The pipeline, tested once against fake modifiers. Everything here is
// behaviour no modifier should have to re-implement or be able to bypass.

import { describe, it, expect, vi } from 'vitest';
import { runModifiers, MAX_PIPELINE_MULTIPLIER, type ActiveModifier, type BeatContext } from '../../src/scoring/engine.js';
import type { Modifier } from '../../src/scoring/modifier.js';
import { zeroPerFamily } from '../../src/models.js';

const beat: BeatContext = {
  delta: 1_000,
  components: zeroPerFamily(),
  dt_ms: 60_000,
  now_ms: 1_700_000_000_000,
  horse: { horse_id: 'h1', current_tokens: 0, joined_at: '2026-01-01T00:00:00Z' },
  field: [],
};

/** A modifier returning whatever the test asks for. */
function fake(apply: Modifier['apply'], id = 'stamina'): ActiveModifier {
  return {
    modifier: {
      id: id as Modifier['id'],
      label: 'Fake', description: 'fake', enabledByDefault: false, params: {}, apply,
    },
    params: {},
    state: {},
  };
}

describe('runModifiers', () => {
  it('passes the delta through untouched when nothing is active', () => {
    // Byte-for-byte, NOT rounded: a race running no mechanics must score exactly
    // what it produced, fractions and all.
    const result = runModifiers([], { ...beat, delta: 1234.5 });
    expect(result.scored_delta).toBe(1234.5);
    expect(result.attribution).toEqual([]);
  });

  it('applies a single multiplier and rounds once', () => {
    const result = runModifiers([fake(() => ({ multiplier: 0.5 }))], beat);
    expect(result.scored_delta).toBe(500);
  });

  it('rounds once a mechanic is active, even at multiplier 1', () => {
    const result = runModifiers([fake(() => ({ multiplier: 1 }))], { ...beat, delta: 2000.5 });
    expect(result.scored_delta).toBe(2001);
  });

  it('folds several modifiers into a product', () => {
    const result = runModifiers(
      [fake(() => ({ multiplier: 0.5 })), fake(() => ({ multiplier: 0.5 }), 'stamina')],
      beat,
    );
    expect(result.scored_delta).toBe(250);
  });

  it('gives the same answer whichever order they run in', () => {
    // The property that makes modifier order not worth configuring.
    const a = fake(() => ({ multiplier: 0.25 }));
    const b = fake(() => ({ multiplier: 1.5 }), 'stamina');
    expect(runModifiers([a, b], beat).scored_delta).toBe(runModifiers([b, a], beat).scored_delta);
  });

  it('shows every modifier the SAME delta, not each others output', () => {
    const seen: number[] = [];
    const spy = (m: number) => fake((ctx) => { seen.push(ctx.delta); return { multiplier: m }; });
    runModifiers([spy(0.5), spy(0.5)], beat);
    expect(seen).toEqual([1_000, 1_000]);
  });

  it('caps the combined multiplier, so nothing can mint distance without limit', () => {
    const result = runModifiers([fake(() => ({ multiplier: 100 }))], beat);
    expect(result.scored_delta).toBe(beat.delta * MAX_PIPELINE_MULTIPLIER);
  });

  it('treats a NaN or negative multiplier as 1 rather than poisoning the score', () => {
    expect(runModifiers([fake(() => ({ multiplier: NaN }))], beat).scored_delta).toBe(1_000);
    expect(runModifiers([fake(() => ({ multiplier: -5 }))], beat).scored_delta).toBe(1_000);
    expect(runModifiers([fake(() => ({ multiplier: Infinity }))], beat).scored_delta).toBe(1_000);
  });

  it('records what each modifier contributed', () => {
    const result = runModifiers([fake(() => ({ multiplier: 0.75 }))], beat);
    expect(result.attribution).toEqual([{ id: 'stamina', multiplier: 0.75 }]);
  });

  it('records the clamped-away multiplier as returned, so the cap is visible', () => {
    const result = runModifiers([fake(() => ({ multiplier: 100 }))], beat);
    expect(result.attribution[0]!.multiplier).toBe(100);
  });

  it('collects returned state under the modifier id', () => {
    const result = runModifiers([fake(() => ({ multiplier: 1, state: { level: 42 } }))], beat);
    expect(result.state.stamina).toEqual({ level: 42 });
  });

  it('keeps the previous state when a modifier returns none', () => {
    const active = { ...fake(() => ({ multiplier: 1 })), state: { level: 7 } };
    expect(runModifiers([active], beat).state.stamina).toEqual({ level: 7 });
  });

  it('gives each modifier only its own state bag', () => {
    const seen: unknown[] = [];
    const active = { ...fake((ctx) => { seen.push(ctx.state); return { multiplier: 1 }; }), state: { mine: 1 } };
    runModifiers([active], beat);
    expect(seen).toEqual([{ mine: 1 }]);
  });

  it('hands each modifier its own resolved params', () => {
    const seen: unknown[] = [];
    const active = { ...fake((ctx) => { seen.push(ctx.params); return { multiplier: 1 }; }), params: { taper_floor: 30 } };
    runModifiers([active], beat);
    expect(seen).toEqual([{ taper_floor: 30 }]);
  });

  it('calls each modifier exactly once per beat', () => {
    const apply = vi.fn(() => ({ multiplier: 1 }));
    runModifiers([fake(apply)], beat);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
