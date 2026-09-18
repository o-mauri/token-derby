import { MODEL_KEYS, totalFor, zeroPerModel, type ModelKey } from '@token-derby/shared';

function finiteNonNeg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** A heartbeat's delta, split by source. `components` always sums to `total`. */
export type ResolvedDelta = {
  total: number;
  components: Record<ModelKey, number>;
};

/**
 * The raw (pre-rate-cap) delta for a heartbeat. Every model counts the same, so
 * the total is a plain sum; the split is carried alongside it for the per-model
 * counters. Legacy CLIs send a bare `delta` with no split — it is attributed to
 * claude, which is how those beats have always been scored. Returns null when
 * the body carries neither a usable `components` object nor a valid `delta`.
 */
export function resolveHeartbeatDelta(
  body: { delta?: number; components?: Record<string, number> },
): ResolvedDelta | null {
  if (body.components && typeof body.components === 'object') {
    const components = zeroPerModel();
    for (const key of MODEL_KEYS) components[key] = finiteNonNeg(body.components[key]);
    return { total: totalFor(components), components };
  }
  if (typeof body.delta === 'number' && Number.isFinite(body.delta) && body.delta >= 0) {
    return { total: body.delta, components: { ...zeroPerModel(), claude: body.delta } };
  }
  return null;
}
