// Counts real tokens the Codex CLI produced — same honesty rules as
// counters/claude.ts. Codex stores one rollout JSONL per session under
//   <codexDir>/sessions/YYYY/MM/DD/rollout-*.jsonl   (+ archived_sessions/)
// Token usage lives in `token_count` events whose info.total_token_usage is a
// CUMULATIVE session total, so we take the LAST such event per file (never sum
// events). Fresh input = input_tokens − cached_input_tokens (cached is passive,
// excluded, mirroring Claude's cache_read). Output = output_tokens; reasoning
// is already folded into output, so it is not added.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ModelKey } from '@token-derby/shared';
import { codexSessionsDir } from '../../paths.js';
import { ScanCache, type FileFold } from '../scan-cache.js';
import { readRoot } from '../source-root.js';
import { TokenCounter, type TokenTotals } from './counter.js';

// Live and archived sessions both count; each is an independent subtree that
// may be absent on its own without meaning the Codex home is missing.
const SESSION_DIRS = ['sessions', 'archived_sessions'] as const;

const ROLLOUT_PREFIX = 'rollout-';
const ROLLOUT_EXT = '.jsonl';

// total_token_usage is a CUMULATIVE session total, so folding is last-wins, not
// additive: a newly appended token_count REPLACES the cached value, and a chunk
// carrying no such event leaves the cached value standing.
const CODEX_FOLD: FileFold<TokenTotals> = {
  empty: () => ({ input: 0, output: 0 }),
  append: (acc, lines) => {
    let usage: any = null;
    for (const line of lines) {
      if (!line.trim()) continue;
      let parsed: any;
      try { parsed = JSON.parse(line); } catch { continue; }
      if (parsed?.payload?.type === 'token_count' && parsed.payload.info?.total_token_usage) {
        usage = parsed.payload.info.total_token_usage; // keep overwriting → last wins
      }
    }
    if (!usage) return acc;
    return {
      input: Math.max(0, num(usage.input_tokens) - num(usage.cached_input_tokens)),
      output: num(usage.output_tokens),
    };
  },
};

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export class CodexCounter extends TokenCounter {
  readonly key: ModelKey = 'codex';
  readonly label = 'Codex';

  root(): string {
    return codexSessionsDir();
  }

  protected async discover(root: string): Promise<string[]> {
    // The Codex home itself must exist; its two session subtrees need not.
    await readRoot(root, () => fs.stat(root));
    const out: string[] = [];
    for (const dir of SESSION_DIRS) out.push(...(await collect(path.join(root, dir))));
    return out;
  }

  /** One rollout file is one conversation. */
  protected conversationId(file: string): string {
    return file;
  }

  protected read(cache: ScanCache, file: string): Promise<TokenTotals> {
    return cache.readIncremental(file, CODEX_FOLD);
  }
}

/** Recursively find rollout files. A missing subtree is normal → []. */
async function collect(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collect(full)));
    else if (entry.name.startsWith(ROLLOUT_PREFIX) && entry.name.endsWith(ROLLOUT_EXT)) out.push(full);
  }
  return out;
}
