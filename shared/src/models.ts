import type { BuiltinModelKey, ModelKey, ModelTotals, PiModelKey } from './types.js';

export const MODEL_KEYS = ['claude', 'codex', 'gemini'] as const satisfies readonly BuiltinModelKey[];
export const SECONDARY_WEIGHT = 0.5;

const BUILTIN_LABELS: Record<BuiltinModelKey, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
};

const PI_PREFIX = 'pi:';
const MAX_PI_MODEL_KEY_LENGTH = 512;

export function isBuiltinModelKey(v: unknown): v is BuiltinModelKey {
  return typeof v === 'string' && (MODEL_KEYS as readonly string[]).includes(v);
}

/** Build the canonical wire/storage key for one provider/model used by Pi. */
export function piModelKey(provider: string, model: string): PiModelKey | null {
  const p = provider.trim();
  const m = model.trim();
  if (!p || !m || hasControlChars(p) || hasControlChars(m)) return null;
  try {
    const key = `${PI_PREFIX}${encodeURIComponent(p)}/${encodeURIComponent(m)}` as PiModelKey;
    return key.length <= MAX_PI_MODEL_KEY_LENGTH ? key : null;
  } catch {
    // encodeURIComponent throws for malformed lone UTF-16 surrogates.
    return null;
  }
}

/** Decode a canonical Pi key. Re-encoding rejects malformed/non-canonical input. */
export function piModelParts(v: unknown): { provider: string; model: string } | null {
  if (typeof v !== 'string' || !v.startsWith(PI_PREFIX) || v.length > MAX_PI_MODEL_KEY_LENGTH) return null;
  const slash = v.indexOf('/', PI_PREFIX.length);
  if (slash < 0 || v.indexOf('/', slash + 1) >= 0) return null;
  try {
    const provider = decodeURIComponent(v.slice(PI_PREFIX.length, slash));
    const model = decodeURIComponent(v.slice(slash + 1));
    return piModelKey(provider, model) === v ? { provider, model } : null;
  } catch {
    return null;
  }
}

export function isPiModelKey(v: unknown): v is PiModelKey {
  return piModelParts(v) !== null;
}

export function isModelKey(v: unknown): v is ModelKey {
  return isBuiltinModelKey(v) || isPiModelKey(v);
}

export function modelLabel(key: ModelKey): string {
  if (isBuiltinModelKey(key)) return BUILTIN_LABELS[key];
  const parts = piModelParts(key);
  return parts ? `${parts.provider}/${parts.model} (Pi)` : key;
}

export function emptyModelTotals(): ModelTotals {
  return { claude: 0, codex: 0, gemini: 0 };
}

/** Full weight (1) for the locked primary model, SECONDARY_WEIGHT (0.5) for the rest. */
export function weightFor(primary: ModelKey, key: ModelKey): number {
  return key === primary ? 1 : SECONDARY_WEIGHT;
}

/** The weighted race score across built-in and dynamically discovered Pi model buckets. */
export function weightedTotal(primary: ModelKey, perSource: Readonly<Partial<Record<ModelKey, number>>>): number {
  let total = 0;
  for (const [key, value] of Object.entries(perSource)) {
    if (isModelKey(key) && typeof value === 'number' && Number.isFinite(value) && value > 0) {
      total += value * weightFor(primary, key);
    }
  }
  return total;
}

function hasControlChars(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}
