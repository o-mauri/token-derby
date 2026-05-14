import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { claudeProjectsDir } from '../paths.js';

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

/** @deprecated Use sumTokens() instead */
export async function sumOutputTokens(): Promise<number> {
  const { input, output } = await sumTokens();
  return input + output;
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
    const entries = await fs.readdir(projectDir);
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
    input += addNum(usage.input_tokens)
           + addNum(usage.cache_creation_input_tokens)
           + addNum(usage.cache_read_input_tokens);
    output += addNum(usage.output_tokens);
  }
  return { input, output };
}
