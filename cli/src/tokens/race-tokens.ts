import { MODEL_KEYS, type ModelKey } from '@token-derby/shared';
import { sumTokensByConversation, type TokenTotals } from './transcripts.js';
import { sumCodexByConversation } from './codex.js';
import { sumGeminiByConversation } from './gemini.js';
import type { ScanProgress } from './scan-progress.js';
import { SourceRootMissing } from './source-root.js';
import { logWarn, logError } from '../log/logger.js';

/** Per-source reading for one beat: every model, broken down by conversation. */
export type AllSources = {
  byConv: Record<ModelKey, Map<string, number>>; // model → convId → scored value
};

/** A beat that could not be read. `stall` is a human-readable cause for the UI. */
export type StallReading = { stall: string };

/** The result of one scan: either usable numbers or a stall carrying its cause. */
export type BeatReading = AllSources | StallReading;

export function isStall(r: BeatReading): r is StallReading {
  return 'stall' in r;
}

const TIMED_OUT = Symbol('scan-timeout');

/**
 * Run a scan under a time budget. Exceeding it resolves to a stall rather than
 * throwing, so a genuine read error still surfaces its own cause to the caller.
 * `describeTimeout` supplies the stall text, letting the caller name whichever
 * source was still running when the budget ran out.
 */
export async function scanWithTimeout(
  scan: () => Promise<BeatReading>,
  timeoutMs: number,
  describeTimeout?: () => Promise<string> | string,
): Promise<BeatReading> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  const startedAt = Date.now();
  try {
    const result = await Promise.race([scan(), budget]);
    if (result !== TIMED_OUT) {
      // Only abnormal beats are logged; the loop already records every beat's duration.
      if (isStall(result)) logWarn('scan.stall', { reason: result.stall, ms: Date.now() - startedAt });
      return result;
    }
    const detail = describeTimeout ? await describeTimeout() : null;
    const stall = detail ?? `Token scan timed out after ${Math.round(timeoutMs / 1000)}s`;
    logWarn('scan.timeout', { budget_ms: timeoutMs, reason: stall });
    return { stall };
  } catch (err) {
    // The caller turns this into a stall reading, which would otherwise leave the
    // log showing a healthy beat while the racer sees a failure on screen.
    logError('scan.error', {
      message: (err as Error)?.message ?? String(err),
      stack: (err as Error)?.stack,
      ms: Date.now() - startedAt,
    });
    throw err;
  } finally {
    clearTimeout(timer); // never let the budget timer outlive the beat
  }
}

const BY_CONVERSATION_READERS: Record<ModelKey, () => Promise<Map<string, TokenTotals>>> = {
  claude: sumTokensByConversation,
  codex: sumCodexByConversation,
  gemini: sumGeminiByConversation,
};

/** Collapse a source's totals to a single number. */
export function scoreFor(t: TokenTotals): number {
  return t.input + t.output;
}

function emptyByConv(): Record<ModelKey, Map<string, number>> {
  return { claude: new Map(), codex: new Map(), gemini: new Map() };
}

/**
 * Read every source for a beat, each broken down by conversation. All three are
 * kicked off together, so a beat costs the SLOWEST source rather than the sum.
 *
 * Every model counts the same now, so every model is load-bearing: a genuine read
 * error on any of them stalls the beat and reports its cause, rather than silently
 * scoring that source 0 for the rest of the race. The one exception is a MISSING
 * ROOT (SourceRootMissing) — hardly any machine has all three tools installed, so
 * an absent root simply means that source produced nothing and must never freeze
 * a race.
 */
export async function readAllSources(progress?: ScanProgress): Promise<BeatReading> {
  const scans = MODEL_KEYS.map((key) => {
    progress?.begin(key);
    return BY_CONVERSATION_READERS[key]()
      .then(map => ({ ok: true as const, key, map }))
      .catch((err: any) => ({ ok: false as const, key, err }))
      .finally(() => progress?.end(key));
  });
  const results = await Promise.all(scans);

  const byConv = emptyByConv();
  let firstFailure: { key: ModelKey; message: string } | null = null;
  // MODEL_KEYS order, so a beat that breaks two sources always names the same one.
  for (const result of results) {
    if (result.ok) {
      for (const [id, totals] of result.map) byConv[result.key].set(id, scoreFor(totals));
      continue;
    }
    // An absent root is the normal case — few machines have all three tools — so
    // only a real read error earns a line, or a missing source would write one
    // every beat and bury the failures that matter.
    if (result.err instanceof SourceRootMissing) continue;
    const message = result.err?.message ?? String(result.err);
    logWarn('scan.source.err', { source: result.key, message });
    // Every source is logged, but only the first names the stall, so the UI
    // message stays stable when two break at once.
    firstFailure ??= { key: result.key, message };
  }
  if (firstFailure) {
    return { stall: `Can't read ${firstFailure.key} token usage: ${firstFailure.message}` };
  }
  return { byConv };
}
