// Counts real tokens the Gemini CLI produced — same honesty rules as
// harnesses/claude-code. Sessions live at
//   <geminiDir>/<projectHash>/chats/session-*.json[l]
// Each "gemini" message carries a per-turn `tokens` object:
//   { input, output, cached, thoughts, tool, total }
// Fresh input = input − cached (cached is passive context, excluded, mirroring
// Claude's cache_read). Output = output (candidates), which ALREADY includes
// thoughts/reasoning — so thoughts is NOT added (that would double-count).

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { geminiTmpDir } from '../../../paths.js';
import { readRoot } from '../../source-root.js';
import { wholeFile, type Harness, type TokenTotals } from '../harness.js';

// Chats hang off each project directory; a project without one is normal.
const CHATS_DIR = 'chats';
const CHAT_EXTS = ['.json', '.jsonl'] as const;

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export const geminiCli: Harness = {
  id: 'gemini-cli',
  label: 'Gemini CLI',
  enabledByDefault: true,   // counted since before harnesses were configurable
  overrideVar: 'TOKEN_DERBY_GEMINI_DIR',
  root: geminiTmpDir,
  // Gemini chats are rewritten whole rather than appended to, so there is no
  // offset to resume from — the cache gates on mtime+size and recomputes in full.
  counting: wholeFile((raw, file) => ({ families: { google: sumRaw(file, raw) } })),

  async discover(root) {
    const entries = await readRoot(root, () => fs.readdir(root));
    const out: string[] = [];
    for (const entry of entries) {
      const chatsDir = path.join(root, entry, CHATS_DIR);
      let files: string[];
      try {
        files = await fs.readdir(chatsDir);
      } catch {
        continue; // not every project dir has a chats/ subdir
      }
      for (const f of files) {
        if (CHAT_EXTS.some(ext => f.endsWith(ext))) out.push(path.join(chatsDir, f));
      }
    }
    return out;
  },

  /** One chat file is one conversation. */
  conversationId(file) {
    return file;
  },
};

function sumRaw(file: string, raw: string): TokenTotals {
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
