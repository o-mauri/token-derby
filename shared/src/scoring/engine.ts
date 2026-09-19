// The scoring pipeline, shared by every modifier and reachable by none of them.
//
// Raw tokens in, scored distance out. Each modifier contributes a multiplier
// computed from the SAME beat, so nothing a modifier does changes what the next
// one sees -- the fold is a product, and a product commutes. Order is therefore
// not configurable, because there is nothing for it to mean.

import { MODEL_FAMILIES } from '../models.js';
import type { ModelFamily } from '../types.js';
import type { Modifier, ModifierContext, ModifierId, ModifierMultiplier, ModifierState } from './modifier.js';

/** One modifier a race is running, with its tuning and its own state. */
export type ActiveModifier = {
  modifier: Modifier;
  params: Record<string, number>;
  state: ModifierState;
};

export type PipelineResult = {
  scored_delta: number;
  /** Each modifier's state after the beat, keyed by modifier id. */
  state: Partial<Record<ModifierId, ModifierState>>;
  /**
   * What each modifier contributed. The multiplier is the EFFECTIVE one for
   * this beat -- a per-family mechanic that touched none of the families in
   * play reports 1, which is what it actually did.
   */
  attribution: Array<{ id: ModifierId; multiplier: number }>;
};

/** Context minus the per-modifier fields the engine fills in. */
export type BeatContext = Omit<ModifierContext, 'params' | 'state'>;

export function runModifiers(active: readonly ActiveModifier[], beat: BeatContext): PipelineResult {
  const state: Partial<Record<ModifierId, ModifierState>> = {};
  const attribution: Array<{ id: ModifierId; multiplier: number }> = [];

  // One running product per family. A whole-beat multiplier multiplies all of
  // them; a per-family one multiplies only what it names. Products commute
  // either way, which is what keeps modifier order meaningless.
  const product = Object.fromEntries(MODEL_FAMILIES.map(f => [f, 1])) as Record<ModelFamily, number>;

  for (const { modifier, params, state: previous } of active) {
    const outcome = modifier.apply({ ...beat, params, state: previous });
    const before = applied(beat, product);
    for (const family of MODEL_FAMILIES) product[family] *= safe(outcome.multiplier, family);
    const after = applied(beat, product);
    // Report what this modifier actually did to THIS beat, so a mechanic that
    // touched no family in play reads as 1 rather than as its nominal value.
    attribution.push({ id: modifier.id, multiplier: before === 0 ? 1 : after / before });
    state[modifier.id] = outcome.state ?? previous;
  }

  // Round only when a mechanic actually ran. With none active the delta must
  // pass through byte-for-byte: rounding an untouched value would quietly
  // change scores for every race that runs no modifiers at all.
  const scored_delta = active.length === 0 ? beat.delta : Math.round(applied(beat, product));

  return { scored_delta, state, attribution };
}

/**
 * The beat's distance under the current per-family products.
 *
 * `components` sums to `delta` by construction, so while every product is equal
 * this is exactly `delta x product` -- the per-family split only starts to
 * matter once a modifier treats families differently.
 */
function applied(beat: BeatContext, product: Record<ModelFamily, number>): number {
  let total = 0;
  for (const family of MODEL_FAMILIES) total += beat.components[family] * product[family];
  return total;
}

/**
 * One family's multiplier from an outcome. A NaN, infinite or negative value is
 * a broken modifier rather than a deliberate one, and must not poison a score.
 */
function safe(multiplier: ModifierMultiplier, family: ModelFamily): number {
  const raw = typeof multiplier === 'number' ? multiplier : multiplier[family] ?? 1;
  return Number.isFinite(raw) && raw >= 0 ? raw : 1;
}
