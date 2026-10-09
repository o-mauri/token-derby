import { MODEL_FAMILIES, zeroPerFamily, type HeartbeatLedger, type ModelFamily } from '@token-derby/shared';
import { resolvePerFamily } from './heartbeat-delta.js';

type PerFamily = Record<ModelFamily, number>;

/** What the CLI says its previous beat was, with every family resolved. */
export type ResolvedLedger = {
  seq: number;
  components: PerFamily;
  counted: PerFamily;
};

/** The ledger a heartbeat carries, or null when there is none or it is unusable. */
export const resolveLedger = (raw: HeartbeatLedger | undefined): ResolvedLedger | null => {
  if (!raw || typeof raw !== 'object') return null;
  const { seq, components, counted } = raw;
  if (typeof seq !== 'number' || !Number.isFinite(seq) || seq < 1) return null;
  if (!components || typeof components !== 'object' || !counted || typeof counted !== 'object') return null;
  return { seq, components: resolvePerFamily(components), counted: resolvePerFamily(counted) };
};

export type Reconciliation = {
  /** What the CLI counted minus what the server holds since the ledger base. */
  drift: PerFamily;
  /**
   * The correction to apply with this beat, per family. Negative removes tokens
   * the server holds that the CLI never counted (a call that did not come from
   * it). Positive gives back tokens the CLI counted that the server never applied.
   */
  fix: PerFamily;
};

/**
 * Check the CLI's running total against the server's own.
 *
 * `ledgerBase` is set so that the server's total minus the base equals the CLI's
 * running total, which makes any difference between them tokens one side saw and
 * the other did not. The correction is bounded: it can remove no more than the
 * server holds, and give back no more than the previous beat claimed, so one
 * beat's check cannot rewrite a horse's history.
 *
 * Nothing is checked without both a ledger and a base, which is a process's first
 * beat, a CLI that predates the ledger, or a horse from before the server did.
 */
export const reconcileLedger = (input: {
  ledger: ResolvedLedger | null;
  modelTokens: PerFamily;
  ledgerBase: PerFamily | undefined;
}): Reconciliation => {
  const { ledger, modelTokens, ledgerBase } = input;
  const drift = zeroPerFamily();
  const fix = zeroPerFamily();
  if (!ledger || !ledgerBase) return { drift, fix };

  for (const family of MODEL_FAMILIES) {
    const held = modelTokens[family] - ledgerBase[family];
    drift[family] = ledger.counted[family] - held;
    fix[family] = drift[family] < 0
      ? -Math.min(-drift[family], Math.max(0, Math.min(held, modelTokens[family])))
      : Math.min(drift[family], ledger.components[family]);
  }
  return { drift, fix };
};

/**
 * The base for the NEXT beat's check: server total after this beat minus the CLI's
 * running total after it. For a beat applied in full this is the base it already
 * had. For one the server chose not to apply in full (before the gun, or over the
 * sanity cap) it absorbs the difference, so that is never read as drift later.
 * It also absorbs whatever part of a drift the bounded correction left.
 */
export const nextLedgerBase = (input: {
  modelTokensAfter: PerFamily;
  ledger: ResolvedLedger | null;
  claimed: PerFamily;
}): PerFamily => {
  const { modelTokensAfter, ledger, claimed } = input;
  const base = zeroPerFamily();
  for (const family of MODEL_FAMILIES) {
    base[family] = modelTokensAfter[family] - ((ledger?.counted[family] ?? 0) + claimed[family]);
  }
  return base;
};
