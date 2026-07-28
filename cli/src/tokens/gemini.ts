import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { geminiTmpDir } from '../paths.js';
import type { TokenTotals } from './transcripts.js';
import { mapWithConcurrency, SCAN_CONCURRENCY } from './pool.js';
import { ScanCache } from './scan-cache.js';

// Counts real tokens the Gemini CLI produced — same honesty rules as
// tokens/transcripts.ts. Sessions live at
//   <geminiDir>/<projectHash>/chats/session-*.json[l]
// Each "gemini" message carries a per-turn `tokens` object:
//   { input, output, cached, thoughts, tool, total }
// Fresh input = input − cached (cached is passive context, excluded, mirroring
// Claude's cache_read). Output = output (candidates), which ALREADY includes
// thoughts/reasoning — so thoughts is NOT added (that would double-count).

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function sumGeminiByConversation(): Promise<Map<string, TokenTotals>> {
  const files = await listChatFiles(geminiTmpDir()); // throws on missing root → fail-loud
  const cache = await ScanCache.open('gemini');
  const totals = await mapWithConcurrency(files, SCAN_CONCURRENCY, f =>
    cache.readWhenChanged(f, async raw => sumGeminiRaw(f, raw)).catch(() => ({ input: 0, output: 0 })),
  );
  await cache.save();
  const byConv = new Map<string, TokenTotals>();
  files.forEach((file, i) => byConv.set(file, totals[i]!)); // one chat file = one conversation
  return byConv;
}

export async function sumGeminiTokens(): Promise<TokenTotals> {
  const byConv = await sumGeminiByConversation();
  let input = 0;
  let output = 0;
  for (const t of byConv.values()) { input += t.input; output += t.output; }
  return { input, output };
}

async function listChatFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root); // throws ENOENT if the Gemini root is absent → fail-loud
  const out: string[] = [];
  for (const entry of entries) {
    const chatsDir = path.join(root, entry, 'chats');
    let files: string[];
    try {
      files = await fs.readdir(chatsDir);
    } catch {
      continue; // not every project dir has a chats/ subdir
    }
    for (const f of files) {
      if (f.endsWith('.json') || f.endsWith('.jsonl')) out.push(path.join(chatsDir, f));
    }
  }
  return out;
}

// Gemini chats are rewritten whole rather than appended to, so there is no
// offset to resume from — the cache gates on mtime+size and recomputes in full.
function sumGeminiRaw(file: string, raw: string): TokenTotals {
  const messages = file.endsWith('.jsonl') ? parseJsonl(raw) : parseJson(raw);
  let input = 0;
  let output = 0;
  for (const m of messages) {
    const tk = (m as any)?.tokens;
    if (!tk || typeof tk !== 'object') continue;
    input += Math.max(0, num(tk.input) - num(tk.cached));
    output += num(tk.output);
  }
  return { input, output };
}

function parseJson(raw: string): unknown[] {
  try {
    const data = JSON.parse(raw) as any;
    return Array.isArray(data?.messages) ? data.messages : [];
  } catch {
    return [];
  }
}

function parseJsonl(raw: string): unknown[] {
  const out: unknown[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return out;
}
