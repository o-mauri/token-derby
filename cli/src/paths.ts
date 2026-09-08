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

export function activeRaceFile(joinCode: string): string {
  return path.join(homeDir(), 'active-races', `${joinCode}.json`);
}

export function activeRacesDir(): string {
  return path.join(homeDir(), 'active-races');
}

export function claudeProjectsDir(): string {
  return process.env.TOKEN_DERBY_CLAUDE_DIR ?? path.join(os.homedir(), '.claude', 'projects');
}

export function codexSessionsDir(): string {
  return process.env.TOKEN_DERBY_CODEX_DIR ?? path.join(os.homedir(), '.codex');
}

export function geminiTmpDir(): string {
  return process.env.TOKEN_DERBY_GEMINI_DIR ?? path.join(os.homedir(), '.gemini', 'tmp');
}

export function piSessionsDir(): string {
  if (process.env.TOKEN_DERBY_PI_DIR) return process.env.TOKEN_DERBY_PI_DIR;
  if (process.env.PI_CODING_AGENT_SESSION_DIR) return process.env.PI_CODING_AGENT_SESSION_DIR;
  const agentDir = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), '.pi', 'agent');
  return path.join(agentDir, 'sessions');
}
