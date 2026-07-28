import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { codexSessionsDir } from '../paths.js';
import type { TokenTotals } from './transcripts.js';
import { mapWithConcurrency, SCAN_CONCURRENCY } from './pool.js';
import { ScanCache, type FileFold } from './scan-cache.js';

// Counts real tokens the Codex CLI produced — same honesty rules as
// tokens/transcripts.ts. Codex stores one rollout JSONL per session under
//   <codexDir>/sessions/YYYY/MM/DD/rollout-*.jsonl   (+ archived_sessions/)
// Token usage lives in `token_count` events whose info.total_token_usage is a
// CUMULATIVE session total, so we take the LAST such event per file (never sum
// events). Fresh input = input_tokens − cached_input_tokens (cached is passive,
// excluded, mirroring Claude's cache_read). Output = output_tokens; reasoning
// is already folded into output, so it is not added.

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function sumCodexByConversation(): Promise<Map<string, TokenTotals>> {
  const root = codexSessionsDir();
  await fs.stat(root); // throws ENOENT if the Codex home is absent → fail-loud (matches Claude/Gemini)
  const files = [
    ...(await collectRollouts(path.join(root, 'sessions'))),
    ...(await collectRollouts(path.join(root, 'archived_sessions'))),
  ];
  const cache = await ScanCache.open('codex');
  const totals = await mapWithConcurrency(files, SCAN_CONCURRENCY, f =>
    cache.readIncremental(f, CODEX_FOLD).catch(() => ({ input: 0, output: 0 })),
  );
  await cache.save();
  const byConv = new Map<string, TokenTotals>();
  files.forEach((file, i) => byConv.set(file, totals[i]!)); // one rollout file = one conversation
  return byConv;
}

export async function sumCodexTokens(): Promise<TokenTotals> {
  const byConv = await sumCodexByConversation();
  let input = 0;
  let output = 0;
  for (const t of byConv.values()) { input += t.input; output += t.output; }
  return { input, output };
}

/** Recursively find rollout-*.jsonl files. Missing dir → []. */
async function collectRollouts(dir: string): Promise<string[]> {
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
    if (entry.isDirectory()) out.push(...(await collectRollouts(full)));
    else if (entry.name.startsWith('rollout-') && entry.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

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
