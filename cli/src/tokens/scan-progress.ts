// Turns a timed-out beat into something a player can act on. The scan runs all
// sources concurrently, so when the budget expires the useful question is which
// source is STILL going — that one owns the stall.

import type { ModelKey } from '@token-derby/shared';
import { ScanCache } from './scan-cache.js';

/** Env var that repoints (or empties) a source's history directory. */
function skipVar(key: ModelKey): string {
  return `TOKEN_DERBY_${key.toUpperCase()}_DIR`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

/** Tracks when each source's scan started and whether it ever finished. */
export class ScanProgress {
  private readonly started = new Map<ModelKey, number>();
  private readonly finished = new Set<ModelKey>();

  begin(key: ModelKey): void {
    this.started.set(key, Date.now());
  }

  end(key: ModelKey): void {
    this.finished.add(key);
  }

  /** Sources begun but never finished, longest-running first. */
  outstanding(): ModelKey[] {
    return [...this.started.entries()]
      .filter(([key]) => !this.finished.has(key))
      .sort((a, b) => a[1] - b[1]) // earliest start = longest running
      .map(([key]) => key);
  }
}

/** Stall text for a scan that blew its budget. `bytes` of 0 means "not known yet". */
export function describeScanTimeout(
  timeoutMs: number,
  outstanding: ReadonlyArray<{ key: ModelKey; bytes: number }>,
): string {
  const budget = `Token scan timed out after ${Math.round(timeoutMs / 1000)}s`;
  if (outstanding.length === 0) return budget;

  const named = outstanding
    .map(s => (s.bytes > 0 ? `${s.key} (${formatBytes(s.bytes)})` : s.key))
    .join(', ');
  // No trailing punctuation: the status screen appends ". Your race continues."
  const biggest = [...outstanding].sort((a, b) => b.bytes - a.bytes)[0]!;
  return `${budget} — ${named} still scanning; point ${skipVar(biggest.key)} at an empty dir to skip it`;
}

/**
 * Stall text for a real timeout, sizing each outstanding source from the cache
 * it wrote on its last completed scan. Sizes are absent on a first-ever scan.
 */
export async function diagnoseScanTimeout(timeoutMs: number, progress: ScanProgress): Promise<string> {
  const outstanding = await Promise.all(
    progress.outstanding().map(async key => ({ key, bytes: await ScanCache.knownBytes(key) })),
  );
  return describeScanTimeout(timeoutMs, outstanding);
}
