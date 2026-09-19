import { MODEL_FAMILIES, familyForKey, totalFor, zeroPerFamily, type ModelFamily } from '@token-derby/shared';

function finiteNonNeg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** A heartbeat's delta, split by model family. `components` always sums to `total`. */
export type ResolvedDelta = {
  total: number;
  components: Record<ModelFamily, number>;
};

/**
 * The raw (pre-rate-cap) delta for a heartbeat. Every family counts the same, so
 * the total is a plain sum; the split is carried alongside it for the per-family
 * counters.
 *
 * Component keys are matched through familyForKey, so a CLI predating the
 * harness/family split still scores: it sends `claude`/`codex`/`gemini` and those
 * resolve to the families they always meant. A key naming no family we score is
 * ignored rather than guessed at.
 *
 * Legacy CLIs send a bare `delta` with no split at all — attributed to anthropic,
 * which is how those beats have always been scored. Returns null when the body
 * carries neither a usable `components` object nor a valid `delta`.
 */
export function resolveHeartbeatDelta(
  body: { delta?: number; components?: Record<string, number> },
): ResolvedDelta | null {
  if (body.components && typeof body.components === 'object') {
    const components = zeroPerFamily();
    for (const [key, value] of Object.entries(body.components)) {
      const family = familyForKey(key);
      if (family) components[family] += finiteNonNeg(value);
    }
    return { total: totalFor(components), components };
  }
  if (typeof body.delta === 'number' && Number.isFinite(body.delta) && body.delta >= 0) {
    return { total: body.delta, components: { ...zeroPerFamily(), anthropic: body.delta } };
  }
  return null;
}

export { MODEL_FAMILIES };
