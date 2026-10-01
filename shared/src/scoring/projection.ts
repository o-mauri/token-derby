// Turns projected raw output into projected score, using each modifier's `project` hook.
import { MODEL_FAMILIES } from '../models.js';
import type { ModelFamily, ModifierStates } from '../types.js';
import { activeModifiersFor, type ScoringRace } from '../scoring.js';
import { safeMultiplier, type ActiveModifier } from './engine.js';

export const PROJECTION_STEP_MINUTES = 6;

export type ProjectionInput = {
  race: ScoringRace;
  modifier_states: ModifierStates;
  model_tokens?: Partial<Record<ModelFamily, number>>;
  pace: number;
  maxMinutes: number;
  /** scored/raw observed in this race; stands in for modifiers with no projection. */
  fallbackRatio: number;
};

export function projectionTable(input: ProjectionInput): Float32Array {
  const active = activeModifiersFor(input.race, input.modifier_states);
  if (active.length === 0) return Float32Array.of(1);
  return projectionFrom(active, input);
}

export function projectionFrom(
  active: readonly ActiveModifier[],
  input: Omit<ProjectionInput, 'race' | 'modifier_states'>,
): Float32Array {
  if (active.length === 0) return Float32Array.of(1);
  const steps = Math.max(1, Math.ceil(input.maxMinutes / PROJECTION_STEP_MINUTES)) + 1;
  // An observed ratio already contains every modifier, so it can't be mixed with hooks.
  if (active.some((a) => !a.modifier.project)) {
    const r = Number.isFinite(input.fallbackRatio) && input.fallbackRatio >= 0 ? input.fallbackRatio : 1;
    return new Float32Array(steps).fill(r);
  }
  const shares = familyShares(input.model_tokens);
  const curves = active.map((a) => a.modifier.project!({
    state: a.state, params: a.params, pace: input.pace, stepMinutes: PROJECTION_STEP_MINUTES, steps,
  }));
  const out = new Float32Array(steps);
  for (let i = 0; i < steps; i++) {
    let total = 0;
    for (const family of MODEL_FAMILIES) {
      let product = 1;
      for (const c of curves) product *= safeMultiplier(c[i] ?? 1, family);
      total += shares[family] * product;
    }
    out[i] = total;
  }
  return out;
}

export function projectedMultiplier(table: Float32Array, activeMinutes: number): number {
  return table[Math.min(table.length - 1, Math.max(0, Math.round(activeMinutes / PROJECTION_STEP_MINUTES)))]!;
}

function familyShares(tokens?: Partial<Record<ModelFamily, number>>): Record<ModelFamily, number> {
  const out = Object.fromEntries(MODEL_FAMILIES.map((f) => [f, 0])) as Record<ModelFamily, number>;
  const total = MODEL_FAMILIES.reduce((s, f) => s + Math.max(0, tokens?.[f] ?? 0), 0);
  if (!(total > 0)) { out.anthropic = 1; return out; }
  for (const f of MODEL_FAMILIES) out[f] = Math.max(0, tokens?.[f] ?? 0) / total;
  return out;
}
