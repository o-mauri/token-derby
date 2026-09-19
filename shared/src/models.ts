import type { ModelFamily } from './types.js';

export const MODEL_FAMILIES = ['anthropic', 'openai', 'google'] as const satisfies readonly ModelFamily[];

/**
 * What CLIs before the harness/family split called each family. Their keys named
 * the tool rather than the vendor, which broke down as soon as one tool could run
 * several vendors' models. Accepted on the wire so an un-upgraded CLI scores
 * normally rather than silently counting zero; drop once those are gone.
 */
export const LEGACY_FAMILY_KEYS: Record<string, ModelFamily> = {
  claude: 'anthropic',
  codex: 'openai',
  gemini: 'google',
};

export function isModelFamily(v: unknown): v is ModelFamily {
  return typeof v === 'string' && (MODEL_FAMILIES as readonly string[]).includes(v);
}

/** The family a wire key names, accepting both current and legacy spellings. */
export function familyForKey(key: string): ModelFamily | null {
  if (isModelFamily(key)) return key;
  return LEGACY_FAMILY_KEYS[key] ?? null;
}

/** Race score across the families. Every family counts the same. */
export function totalFor(perFamily: Record<ModelFamily, number>): number {
  let total = 0;
  for (const family of MODEL_FAMILIES) total += perFamily[family];
  return total;
}

/** A zeroed per-family board. */
export function zeroPerFamily(): Record<ModelFamily, number> {
  return { anthropic: 0, openai: 0, google: 0 };
}
