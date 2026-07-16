import type { ModelKey } from './types.js';

export const MODEL_KEYS = ['claude', 'codex', 'gemini'] as const satisfies readonly ModelKey[];
export const SECONDARY_WEIGHT = 0.5;

export function isModelKey(v: unknown): v is ModelKey {
  return typeof v === 'string' && (MODEL_KEYS as readonly string[]).includes(v);
}

/** Full weight (1) for the locked primary model, SECONDARY_WEIGHT (0.5) for the rest. */
export function weightFor(primary: ModelKey, key: ModelKey): number {
  return key === primary ? 1 : SECONDARY_WEIGHT;
}

/** The weighted race score: primary at 1:1, the other two models at 50%. */
export function weightedTotal(primary: ModelKey, perSource: Record<ModelKey, number>): number {
  let total = 0;
  for (const key of MODEL_KEYS) total += perSource[key] * weightFor(primary, key);
  return total;
}
