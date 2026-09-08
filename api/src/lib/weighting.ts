import { isModelKey, MAX_HEARTBEAT_COMPONENTS, weightFor, type ModelKey } from '@token-derby/shared';

function finiteNonNeg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * The raw (pre-rate-cap) weighted delta for a heartbeat. New CLIs send per-source
 * `components`; the locked `primary` model counts 1:1 and the others at 50%.
 * Components may include namespaced Pi provider/model keys discovered locally.
 * Legacy CLIs send a bare `delta` (treated as primary-only). Returns null when
 * the body carries neither a usable `components` object nor a valid `delta`.
 */
export function resolveHeartbeatDelta(
  body: { delta?: number; components?: Readonly<Record<string, number | undefined>> },
  primary: ModelKey,
): number | null {
  if (body.components && typeof body.components === 'object' && !Array.isArray(body.components)) {
    const entries = Object.entries(body.components);
    let total = 0;
    let remaining = MAX_HEARTBEAT_COMPONENTS;

    // New CLIs already stay within the cap. For an older same-minor process
    // that sends more, preserve wire compatibility instead of rejecting every
    // heartbeat: always score its locked primary, then a deterministic bounded
    // prefix. The body-size limit bounds JSON parsing before this point.
    const primaryEntry = entries.find(([key]) => key === primary);
    if (primaryEntry) {
      total += finiteNonNeg(primaryEntry[1]);
      remaining -= 1;
    }
    for (const [key, value] of entries) {
      if (remaining <= 0) break;
      if (key === primary) continue;
      if (isModelKey(key)) total += finiteNonNeg(value) * weightFor(primary, key);
      remaining -= 1;
    }
    return total;
  }
  if (typeof body.delta === 'number' && Number.isFinite(body.delta) && body.delta >= 0) {
    return body.delta;
  }
  return null;
}
