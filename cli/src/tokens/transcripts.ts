import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { claudeProjectsDir } from '../paths.js';

// `input` here is "fresh-input" tokens only: input_tokens (this turn's new
// content) + cache_creation_input_tokens (tokens written into the cache this
// turn). cache_read_input_tokens is intentionally excluded — those are
// passive context that don't represent work done in the race.
export type TokenTotals = { input: number; output: number };

export async function sumTokens(): Promise<TokenTotals> {
  const root = claudeProjectsDir();
  const files = await listJsonlFiles(root);
  let input = 0;
  let output = 0;
  for (const file of files) {
    const t = await sumFile(file);
    input += t.input;
    output += t.output;
  }
  return { input, output };
}

// Total tokens for a race in the race's chosen mode. When race.counts_input
// is true, the race counts fresh-input + cache-creation + output; otherwise
// it counts output only. cache_read is never included.
export async function sumTokensForRace(race: { counts_input?: boolean }): Promise<number> {
  const { input, output } = await sumTokens();
  return race.counts_input ? input + output : output;
}

async function listJsonlFiles(root: string): Promise<string[]> {
  let projects: string[];
  try {
    projects = await fs.readdir(root);
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
  const out: string[] = [];
  for (const project of projects) {
    const projectDir = path.join(root, project);
    let stat;
    try {
      stat = await fs.stat(projectDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;
    let entries: string[];
    try {
      entries = await fs.readdir(projectDir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.endsWith('.jsonl')) out.push(path.join(projectDir, entry));
    }
  }
  return out;
}

function addNum(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function sumFile(file: string): Promise<TokenTotals> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return { input: 0, output: 0 };
  }
  let input = 0;
  let output = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const usage = parsed?.message?.usage;
    if (!usage) continue;
    input += addNum(usage.input_tokens) + addNum(usage.cache_creation_input_tokens);
    output += addNum(usage.output_tokens);
  }
  return { input, output };
}
