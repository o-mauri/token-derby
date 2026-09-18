import type { ModelKey } from './types.js';

export const MODEL_KEYS = ['claude', 'codex', 'gemini'] as const satisfies readonly ModelKey[];

export function isModelKey(v: unknown): v is ModelKey {
  return typeof v === 'string' && (MODEL_KEYS as readonly string[]).includes(v);
}

/** Race score across the sources. Every model counts the same. */
export function totalFor(perSource: Record<ModelKey, number>): number {
  let total = 0;
  for (const key of MODEL_KEYS) total += perSource[key];
  return total;
}

/** A zeroed per-model board. */
export function zeroPerModel(): Record<ModelKey, number> {
  return { claude: 0, codex: 0, gemini: 0 };
}
