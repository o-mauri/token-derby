import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { claudeProjectsDir } from '../paths.js';

export async function sumOutputTokens(): Promise<number> {
  const root = claudeProjectsDir();
  const files = await listJsonlFiles(root);
  let total = 0;
  for (const file of files) {
    total += await sumFile(file);
  }
  return total;
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

async function sumFile(file: string): Promise<number> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch {
    return 0;
  }
  let sum = 0;
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const tokens = parsed?.message?.usage?.output_tokens;
    if (typeof tokens === 'number' && Number.isFinite(tokens)) sum += tokens;
  }
  return sum;
}
