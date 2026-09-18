import * as os from 'node:os';
import * as path from 'node:path';
import { baseDir, selectedEnv } from './env/env.js';

export function homeDir(): string {
  const override = process.env.TOKEN_DERBY_HOME;
  if (override) return override;
  const dir = selectedEnv() === 'staging' ? '.token-derby-staging' : '.token-derby';
  return path.join(baseDir(), dir);
}

export function identityFile(): string {
  return path.join(homeDir(), 'identity.json');
}

export function prefsFile(): string {
  return path.join(homeDir(), 'prefs.json');
}

export function activeRaceFile(joinCode: string): string {
  return path.join(homeDir(), 'active-races', `${joinCode}.json`);
}

export function activeRacesDir(): string {
  return path.join(homeDir(), 'active-races');
}

// CLAUDE_CONFIG_DIR relocates Claude Code's whole config, transcripts included.
// Honouring it keeps a relocated install countable instead of silently scoring 0.
export function claudeProjectsDir(): string {
  const override = process.env.TOKEN_DERBY_CLAUDE_DIR;
  if (override) return override;
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  if (configDir) return path.join(configDir, 'projects');
  return path.join(os.homedir(), '.claude', 'projects');
}

export function codexSessionsDir(): string {
  return process.env.TOKEN_DERBY_CODEX_DIR ?? path.join(os.homedir(), '.codex');
}

export function geminiTmpDir(): string {
  return process.env.TOKEN_DERBY_GEMINI_DIR ?? path.join(os.homedir(), '.gemini', 'tmp');
}

export function logDir(): string {
  return path.join(homeDir(), 'logs');
}

export function logFile(): string {
  return path.join(logDir(), 'token-derby.log');
}
