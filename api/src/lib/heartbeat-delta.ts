import { familyForKey, totalFor, zeroPerFamily, type ModelFamily } from '@token-derby/shared';

function finiteNonNeg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** A heartbeat's delta, split by model family. `components` always sums to `total`. */
export type ResolvedDelta = {
  total: number;
  components: Record<ModelFamily, number>;
};

/**
 * The delta for a heartbeat. Every family counts the same, so
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

/** A sanity bound on one beat's raw tokens; real work never comes close. */
export const MAX_RAW_TOKENS_PER_BEAT = 5_000_000;

/**
 * Throw away whatever a beat claims above the cap, keeping each family's share.
 * `components` still sums exactly to `total`, which the counters rely on.
 */
export function capBeat(beat: ResolvedDelta, cap = MAX_RAW_TOKENS_PER_BEAT): ResolvedDelta & { discarded: number } {
  if (beat.total <= cap) return { ...beat, discarded: 0 };
  const scale = cap / beat.total;
  const components = zeroPerFamily();
  let assigned = 0;
  let largest: ModelFamily = 'anthropic';
  for (const family of Object.keys(components) as ModelFamily[]) {
    components[family] = Math.floor(beat.components[family] * scale);
    assigned += components[family];
    if (beat.components[family] > beat.components[largest]) largest = family;
  }
  components[largest] += cap - assigned;   // rounding remainder, so the parts sum to the cap
  return { total: cap, components, discarded: beat.total - cap };
}
