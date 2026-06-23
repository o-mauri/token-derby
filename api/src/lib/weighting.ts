import { MODEL_KEYS, weightFor, type ModelKey } from '@token-derby/shared';

function finiteNonNeg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * The raw (pre-rate-cap) weighted delta for a heartbeat. New CLIs send per-source
 * `components`; the locked `primary` model counts 1:1 and the others at 10%.
 * Legacy CLIs send a bare `delta` (treated as primary-only). Returns null when
 * the body carries neither a usable `components` object nor a valid `delta`.
 */
export function resolveHeartbeatDelta(
  body: { delta?: number; components?: Record<string, number> },
  primary: ModelKey,
): number | null {
  if (body.components && typeof body.components === 'object') {
    let total = 0;
    for (const key of MODEL_KEYS) {
      total += finiteNonNeg(body.components[key]) * weightFor(primary, key);
    }
    return total;
  }
  if (typeof body.delta === 'number' && Number.isFinite(body.delta) && body.delta >= 0) {
    return body.delta;
  }
  return null;
}
