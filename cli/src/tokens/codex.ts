import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { codexSessionsDir } from '../paths.js';
import type { TokenTotals } from './transcripts.js';

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
  const byConv = new Map<string, TokenTotals>();
  for (const file of files) {
    byConv.set(file, await lastTokenCount(file)); // one rollout file = one conversation
  }
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

/** Parse a rollout file and return the fresh-input/output from its LAST token_count event. */
async function lastTokenCount(file: string): Promise<TokenTotals> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return { input: 0, output: 0 };
  }
  let usage: any = null;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let parsed: any;
    try { parsed = JSON.parse(line); } catch { continue; }
    if (parsed?.payload?.type === 'token_count' && parsed.payload.info?.total_token_usage) {
      usage = parsed.payload.info.total_token_usage; // keep overwriting → last wins
    }
  }
  if (!usage) return { input: 0, output: 0 };
  return {
    input: Math.max(0, num(usage.input_tokens) - num(usage.cached_input_tokens)),
    output: num(usage.output_tokens),
  };
}
