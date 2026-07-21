import * as os from 'node:os';
import * as path from 'node:path';

export type TranscriptDirs = { claude: string; codex: string; gemini: string };
const override: Partial<TranscriptDirs> = {};

export function setTranscriptDirs(dirs: Partial<TranscriptDirs>): void {
  for (const k of ['claude', 'codex', 'gemini'] as const) {
    if (dirs[k]) override[k] = dirs[k]; else delete override[k];
  }
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
