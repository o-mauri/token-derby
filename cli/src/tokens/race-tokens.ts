import { MODEL_KEYS, type ModelKey } from '@token-derby/shared';
import { COUNTERS, type TokenTotals } from './counters/index.js';
import type { ScanProgress } from './scan-progress.js';
import { SourceRootMissing } from './source-root.js';
import { logWarn, logError } from '../log/logger.js';

/** A source that could be reached but not counted this beat. */
export type DegradedSource = { key: ModelKey; message: string };

/**
 * Per-source reading for one beat. A degraded source contributes no
 * conversations — skipped rather than partially counted — and is named so the
 * UI can say which one and why.
 */
export type AllSources = {
  byConv: Record<ModelKey, Map<string, number>>; // model → convId → scored value
  degraded: DegradedSource[];
};

/** A beat that could not be read at all. `stall` is a human-readable cause for the UI. */
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

function emptyByConv(): Record<ModelKey, Map<string, number>> {
  return { claude: new Map(), codex: new Map(), gemini: new Map() };
}

/** Collapse a source's totals to a single number. */
export function scoreFor(t: TokenTotals): number {
  return t.input + t.output;
}

/**
 * Read every source for a beat, each broken down by conversation. All three are
 * kicked off together, so a beat costs the SLOWEST source rather than the sum.
 *
 * A source that cannot be read is SKIPPED for this beat, not fatal: the other
 * sources still count and the race keeps running. Nothing is lost by skipping —
 * the tracker's per-conversation floor only ever moves a conversation up, so a
 * source that reports nothing leaves its anchors untouched and catches up as
 * soon as it reads cleanly again. A MISSING ROOT is not a failure at all: few
 * machines have all three tools, so an absent root simply counts as zero and
 * earns no warning.
 */
export async function readAllSources(progress?: ScanProgress): Promise<BeatReading> {
  const scans = MODEL_KEYS.map((key) => {
    progress?.begin(key);
    return COUNTERS[key].byConversation()
      .then(map => ({ ok: true as const, key, map }))
      .catch((err: any) => ({ ok: false as const, key, err }))
      .finally(() => progress?.end(key));
  });
  const results = await Promise.all(scans);

  const byConv = emptyByConv();
  const degraded: DegradedSource[] = [];
  // MODEL_KEYS order, so the warning lists sources the same way every beat.
  for (const result of results) {
    if (result.ok) {
      for (const [id, totals] of result.map) byConv[result.key].set(id, scoreFor(totals));
      continue;
    }
    if (result.err instanceof SourceRootMissing) continue; // not installed → 0
    const message = result.err?.message ?? String(result.err);
    logWarn('scan.source.err', { source: result.key, message });
    degraded.push({ key: result.key, message });
  }
  return { byConv, degraded };
}
