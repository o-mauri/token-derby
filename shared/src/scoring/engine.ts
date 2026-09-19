// The scoring pipeline, shared by every modifier and reachable by none of them.
//
// Raw tokens in, scored distance out. Each modifier contributes a multiplier
// computed from the SAME beat, so nothing a modifier does changes what the next
// one sees -- the fold is a product, and a product commutes. Order is therefore
// not configurable, because there is nothing for it to mean.

import type { Modifier, ModifierContext, ModifierId, ModifierState } from './modifier.js';

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
  /** What each modifier contributed, for the UI and for explaining a score. */
  attribution: Array<{ id: ModifierId; multiplier: number }>;
};

/** Context minus the per-modifier fields the engine fills in. */
export type BeatContext = Omit<ModifierContext, 'params' | 'state'>;

export function runModifiers(active: readonly ActiveModifier[], beat: BeatContext): PipelineResult {
  const state: Partial<Record<ModifierId, ModifierState>> = {};
  const attribution: Array<{ id: ModifierId; multiplier: number }> = [];
  let product = 1;

  for (const { modifier, params, state: previous } of active) {
    const outcome = modifier.apply({ ...beat, params, state: previous });
    // A modifier returning NaN or a negative must not be able to poison a score.
    const multiplier = Number.isFinite(outcome.multiplier) && outcome.multiplier >= 0
      ? outcome.multiplier
      : 1;
    product *= multiplier;
    attribution.push({ id: modifier.id, multiplier });
    state[modifier.id] = outcome.state ?? previous;
  }

  // Round only when a mechanic actually ran. With none active the delta must
  // pass through byte-for-byte: rounding an untouched value would quietly
  // change scores for every race that runs no modifiers at all.
  const scored_delta = active.length === 0 ? beat.delta : Math.round(beat.delta * product);

  return { scored_delta, state, attribution };
}
