import * as os from 'node:os';
import * as path from 'node:path';

export type TranscriptDirs = { claude: string; codex: string; gemini: string };
const override: Partial<TranscriptDirs> = {};

export function setTranscriptDirs(dirs: Partial<TranscriptDirs>): void {
  for (const k of ['claude', 'codex', 'gemini'] as const) {
    if (dirs[k]) override[k] = dirs[k]; else delete override[k];
  }
}

let scanCacheRoot: string | null = null;

// The CLI and the desktop app keep separate homes, so each points the scan cache
// at its own; pass null to fall back to the default below.
export function setScanCacheDir(dir: string | null): void {
  scanCacheRoot = dir;
}

// Where the incremental scan cache is stored. The TOKEN_DERBY_HOME fallback keeps
// a caller that never sets a root (and the engine's own tests) predictable.
export function scanCacheDir(): string {
  if (scanCacheRoot) return scanCacheRoot;
  const home = process.env.TOKEN_DERBY_HOME ?? path.join(os.homedir(), '.token-derby');
  return path.join(home, 'scan-cache');
}

export function claudeProjectsDir(): string {
  return override.claude ?? process.env.TOKEN_DERBY_CLAUDE_DIR ?? path.join(os.homedir(), '.claude', 'projects');
}
export function codexSessionsDir(): string {
  return override.codex ?? process.env.TOKEN_DERBY_CODEX_DIR ?? path.join(os.homedir(), '.codex');
}
export function geminiTmpDir(): string {
  return override.gemini ?? process.env.TOKEN_DERBY_GEMINI_DIR ?? path.join(os.homedir(), '.gemini', 'tmp');
}
