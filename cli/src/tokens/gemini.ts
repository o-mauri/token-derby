import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { geminiTmpDir } from '../paths.js';
import type { TokenTotals } from './transcripts.js';

// Counts real tokens the Gemini CLI produced — same honesty rules as
// tokens/transcripts.ts. The CLI stores chat sessions at
//   ~/.gemini/tmp/<projectHash>/chats/session-*.json
// where each assistant ("gemini") message carries a `tokens` object:
//   { input, output, cached, thoughts, tool, total }
//
// To mirror the Claude scoring philosophy: `input` is fresh prompt tokens
// (the `cached` field — passive context — is excluded), and `output` counts
// generated tokens including `thoughts` (reasoning is real work).
//
// Totals are all-time; the race's baseline-at-join anchor scopes them to the
// tokens produced during the race, exactly like the Claude transcript reading.

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function sumGeminiTokens(): Promise<TokenTotals> {
  const files = await listChatFiles(geminiTmpDir());
  let input = 0;
  let output = 0;
  for (const file of files) {
    const t = await sumGeminiFile(file);
    input += t.input;
    output += t.output;
  }
  return { input, output };
}

async function listChatFiles(root: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(root);
  } catch (e: any) {
    if (e?.code === 'ENOENT') return []; // Gemini CLI not used on this machine
    throw e;
  }
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
      if (f.endsWith('.json')) out.push(path.join(chatsDir, f));
    }
  }
  return out;
}

async function sumGeminiFile(file: string): Promise<TokenTotals> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return { input: 0, output: 0 };
  }
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    return { input: 0, output: 0 };
  }
  const messages = Array.isArray(data?.messages) ? data.messages : [];
  let input = 0;
  let output = 0;
  for (const m of messages) {
    const tk = m?.tokens;
    if (!tk || typeof tk !== 'object') continue;
    input += num(tk.input);                  // fresh prompt; `cached` excluded
    output += num(tk.output) + num(tk.thoughts); // response + reasoning
  }
  return { input, output };
}
