import { MODEL_FAMILIES, type ModelFamily } from '@token-derby/shared';
import { count, type CountResult } from './harnesses/engine.js';
import { HARNESSES, HARNESS_KEYS, type HarnessKey } from './harnesses/registry.js';
import type { TokenTotals } from './harnesses/harness.js';
import type { ScanProgress } from './scan-progress.js';
import { SourceRootMissing } from './source-root.js';
import { logWarn, logError } from '../log/logger.js';

/** A harness that could be reached but not counted this beat. */
export type DegradedSource = { harness: HarnessKey; label: string; message: string };

/**
 * Per-family reading for one beat. A degraded harness contributes no
 * conversations — skipped rather than partially counted — and is named so the
 * UI can say which tool failed and why. `notices` carries partial-count caveats
 * from harnesses that counted, but not all of what they saw.
 */
export type AllSources = {
  byFamily: Record<ModelFamily, Map<string, number>>; // family → convId → scored value
  degraded: DegradedSource[];
  notices: string[];
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

function emptyByFamily(): Record<ModelFamily, Map<string, number>> {
  return { anthropic: new Map(), openai: new Map(), google: new Map() };
}

/** Collapse a conversation's totals to a single number. */
export function scoreFor(t: TokenTotals): number {
  return t.input + t.output;
}

/**
 * Read every harness for a beat, merged by the model family that produced the
 * tokens. All harnesses are kicked off together, so a beat costs the SLOWEST
 * rather than the sum.
 *
 * A harness that cannot be read is SKIPPED for this beat, not fatal: the others
 * still count and the race keeps running. Nothing is lost by skipping — the
 * tracker's per-conversation floor only ever moves a conversation up, so a
 * harness that reports nothing leaves its anchors untouched and catches up as
 * soon as it reads cleanly again. A MISSING ROOT is not a failure at all: few
 * machines have every tool installed, so an absent root counts as zero and earns
 * no warning.
 */
export async function readAllSources(progress?: ScanProgress): Promise<BeatReading> {
  const scans = HARNESS_KEYS.map((key) => {
    progress?.begin(key);
    return count(HARNESSES[key])
      .then(result => ({ ok: true as const, key, result }))
      .catch((err: any) => ({ ok: false as const, key, err }))
      .finally(() => progress?.end(key));
  });
  const results = await Promise.all(scans);

  const byFamily = emptyByFamily();
  const degraded: DegradedSource[] = [];
  const notices = new Set<string>();
  // Registry order, so warnings list harnesses the same way every beat.
  for (const outcome of results) {
    const harness = HARNESSES[outcome.key];
    if (!outcome.ok) {
      if (outcome.err instanceof SourceRootMissing) continue; // not installed → 0
      const message = outcome.err?.message ?? String(outcome.err);
      logWarn('scan.source.err', { harness: outcome.key, message });
      degraded.push({ harness: outcome.key, label: harness.label, message });
      continue;
    }
    mergeInto(byFamily, outcome.result);
    for (const notice of outcome.result.notices) notices.add(notice);
  }
  return { byFamily, degraded, notices: [...notices] };
}

/**
 * Fold one harness's contribution into the shared per-family maps. Several
 * harnesses can feed the same family, which is the whole point of the split.
 */
function mergeInto(byFamily: Record<ModelFamily, Map<string, number>>, result: CountResult): void {
  for (const family of MODEL_FAMILIES) {
    const conversations = result.byFamily.get(family);
    if (!conversations) continue;
    const target = byFamily[family];
    for (const [id, totals] of conversations) target.set(id, scoreFor(totals));
  }
}
