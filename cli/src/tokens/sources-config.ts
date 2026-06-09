import * as fs from 'node:fs/promises';
import { sourcesFile, homeDir } from '../paths.js';

/** A custom-model token source exposing a vLLM-compatible /metrics endpoint. */
export type VllmSource = { name: string; url: string };

type SourcesFile = { vllm?: VllmSource[] };

/** Derive a short name from a URL when one isn't supplied (env entries). */
function hostName(url: string): string {
  try {
    return new URL(url).hostname.split('.')[0] || url;
  } catch {
    return url;
  }
}

/** Sources defined in ~/.token-derby/sources.json. Tolerant of missing/corrupt files. */
export async function readFileSources(): Promise<VllmSource[]> {
  let raw: string;
  try {
    raw = await fs.readFile(sourcesFile(), 'utf8');
  } catch {
    return [];
  }
  try {
    const data = JSON.parse(raw) as SourcesFile;
    return (data.vllm ?? []).filter((s): s is VllmSource => !!s && !!s.name && !!s.url);
  } catch {
    return [];
  }
}

/** Sources from TOKEN_DERBY_VLLM_URLS: "name=url,name2=url2" (name optional). */
function envSources(): VllmSource[] {
  const env = process.env.TOKEN_DERBY_VLLM_URLS;
  if (!env) return [];
  const out: VllmSource[] = [];
  for (const part of env.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    const name = eq >= 0 ? trimmed.slice(0, eq).trim() : '';
    const url = eq >= 0 ? trimmed.slice(eq + 1).trim() : trimmed;
    if (!url) continue;
    out.push({ name: name || hostName(url), url });
  }
  return out;
}

/** All configured vLLM sources, env first, deduped by name. */
export async function loadVllmSources(): Promise<VllmSource[]> {
  const out: VllmSource[] = [];
  const seen = new Set<string>();
  for (const s of [...envSources(), ...(await readFileSources())]) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

export async function saveFileSources(sources: VllmSource[]): Promise<void> {
  await fs.mkdir(homeDir(), { recursive: true });
  await fs.writeFile(sourcesFile(), JSON.stringify({ vllm: sources }, null, 2) + '\n', 'utf8');
}

/** Add or replace a source by name. Returns the updated list. */
export async function addSource(name: string, url: string): Promise<VllmSource[]> {
  const sources = (await readFileSources()).filter(s => s.name !== name);
  sources.push({ name, url });
  await saveFileSources(sources);
  return sources;
}

/** Remove a source by name. Returns true if something was removed. */
export async function removeSource(name: string): Promise<boolean> {
  const before = await readFileSources();
  const after = before.filter(s => s.name !== name);
  if (after.length === before.length) return false;
  await saveFileSources(after);
  return true;
}
