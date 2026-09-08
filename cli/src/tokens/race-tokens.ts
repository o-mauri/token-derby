import {
  MODEL_KEYS,
  emptyModelTotals,
  isBuiltinModelKey,
  type BuiltinModelKey,
  type ModelKey,
  type ModelTotals,
} from '@token-derby/shared';
import { sumTokens, sumTokensByConversation, type TokenTotals } from './transcripts.js';
import { sumCodexTokens, sumCodexByConversation } from './codex.js';
import { sumGeminiTokens, sumGeminiByConversation } from './gemini.js';
import { OPTIONAL_PI_SCAN_TIMEOUT_MS } from '../config.js';
import { sumPiByModelAndConversation } from './pi.js';
import type { ScanProgress } from './scan-progress.js';

/** Per-source reading for one beat: secondary scalars + the primary, per conversation. */
export type AllSources = {
  secondary: ModelTotals;                 // every non-primary model bucket
  primaryByConv: Map<string, number>;     // convId → scored value for the primary bucket
  piAvailable?: boolean;                  // false only when Pi could not be read this beat
};

/** A beat that could not be read. `stall` is a human-readable cause for the UI. */
export type StallReading = { stall: string };

/** The result of one scan: either usable numbers or a stall carrying its cause. */
export type BeatReading = AllSources | StallReading;

export function isStall(r: BeatReading): r is StallReading {
  return 'stall' in r;
}

const TIMED_OUT = Symbol('scan-timeout');

/** Run a scan under a time budget, returning an actionable stall on timeout. */
export async function scanWithTimeout(
  scan: () => Promise<BeatReading>,
  timeoutMs: number,
  describeTimeout?: () => Promise<string> | string,
): Promise<BeatReading> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
  });
  try {
    const result = await Promise.race([scan(), budget]);
    if (result !== TIMED_OUT) return result;
    const detail = describeTimeout ? await describeTimeout() : null;
    return { stall: detail ?? `Token scan timed out after ${Math.round(timeoutMs / 1000)}s` };
  } finally {
    clearTimeout(timer);
  }
}

const SCALAR_READERS: Record<BuiltinModelKey, () => Promise<TokenTotals>> = {
  claude: sumTokens,
  codex: sumCodexTokens,
  gemini: sumGeminiTokens,
};

const BY_CONVERSATION_READERS: Record<BuiltinModelKey, () => Promise<Map<string, TokenTotals>>> = {
  claude: sumTokensByConversation,
  codex: sumCodexByConversation,
  gemini: sumGeminiByConversation,
};

/** Collapse a source's totals to a single number in the race's mode. */
export function scoreFor(race: { counts_input?: boolean }, t: TokenTotals): number {
  return race.counts_input ? t.input + t.output : t.output;
}

type Captured<T> = { ok: true; value: T } | { ok: false; err: any };

function capture<T>(promise: Promise<T>): Promise<Captured<T>> {
  return promise.then(
    value => ({ ok: true as const, value }),
    err => ({ ok: false as const, err }),
  );
}

async function within<T>(promise: Promise<T>, timeoutMs: number | undefined): Promise<T> {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(
      new Error(`Pi token scan timed out after ${Math.round(timeoutMs / 1000)}s`),
      { code: 'ETIMEDOUT' },
    )), timeoutMs);
  });
  try {
    return await Promise.race([promise, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}

function isMissing(err: any): boolean {
  return err?.code === 'ENOENT';
}

/**
 * Read all sources for a beat. Built-in CLI sources retain their existing
 * buckets. Pi is scanned once, then each exact provider/model is merged as a
 * dynamic bucket such as `pi:qwen/qwen3-coder`.
 *
 * The primary bucket is the critical path: a genuine read failure stalls the
 * beat, while a missing home directory means 0 tokens. Secondary failures are
 * resilient and contribute 0 for that beat. Baseline reads return partial data
 * with `piAvailable: false` so the tracker can prime Pi on recovery instead of
 * mistaking pre-join history for new usage.
 */
export async function readAllSources(
  race: { counts_input?: boolean },
  primary: ModelKey,
  progress?: ScanProgress,
  options?: { baseline?: boolean; piTimeoutMs?: number },
): Promise<BeatReading> {
  const builtinPrimary = isBuiltinModelKey(primary) ? primary : null;

  const nativePrimaryScan: Promise<Captured<Map<string, TokenTotals>>> = builtinPrimary
    ? (() => {
        progress?.begin(builtinPrimary);
        return capture(BY_CONVERSATION_READERS[builtinPrimary]())
          .finally(() => progress?.end(builtinPrimary));
      })()
    : Promise.resolve({ ok: true, value: new Map() });

  const secondaryKeys = MODEL_KEYS.filter(key => key !== builtinPrimary);
  const nativeSecondaryScans = secondaryKeys.map((key) => {
    progress?.begin(key);
    return SCALAR_READERS[key]()
      .then(t => scoreFor(race, t))
      .catch(() => 0)
      .finally(() => progress?.end(key));
  });

  progress?.begin('pi');
  // Pi is optional during live built-in races, so bound it independently and
  // preserve healthy native readings. When Pi itself is the live primary, the
  // outer heartbeat budget remains authoritative; a valid slower Pi scan must
  // not be cut off at the shorter optional-source budget.
  const piTimeoutMs = options?.piTimeoutMs
    ?? (options?.baseline || builtinPrimary ? OPTIONAL_PI_SCAN_TIMEOUT_MS : undefined);
  const piScan = capture(within(sumPiByModelAndConversation(), piTimeoutMs))
    .finally(() => progress?.end('pi'));

  const [nativePrimary, nativeSecondary, piResult] = await Promise.all([
    nativePrimaryScan,
    Promise.all(nativeSecondaryScans),
    piScan,
  ]);

  const primaryByConv = new Map<string, number>();
  if (nativePrimary.ok) {
    for (const [id, totals] of nativePrimary.value) primaryByConv.set(id, scoreFor(race, totals));
  } else if (!isMissing(nativePrimary.err)) {
    return { stall: `Can't read ${primary} token usage: ${nativePrimary.err?.message ?? String(nativePrimary.err)}` };
  }

  const secondary = emptyModelTotals();
  secondaryKeys.forEach((key, index) => { secondary[key] = nativeSecondary[index] ?? 0; });

  const piAvailable = piResult.ok;
  if (piResult.ok) {
    for (const [key, conversations] of piResult.value) {
      if (key === primary) {
        for (const [id, totals] of conversations) primaryByConv.set(id, scoreFor(race, totals));
      } else {
        let total = 0;
        for (const usage of conversations.values()) total += scoreFor(race, usage);
        secondary[key] = total;
      }
    }
  } else if (!builtinPrimary && !piAvailable && !options?.baseline) {
    return { stall: `Can't read ${primary} token usage: ${piResult.err?.message ?? String(piResult.err)}` };
  }

  return { secondary, primaryByConv, piAvailable };
}
