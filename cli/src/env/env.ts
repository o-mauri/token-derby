import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type EnvName = 'prod' | 'staging';

export const ENV_NAMES: readonly EnvName[] = ['prod', 'staging'];

// Base directory everything hangs off. Overridable via TOKEN_DERBY_BASE for
// tests and advanced setups; defaults to the user's home directory.
export function baseDir(): string {
  return process.env.TOKEN_DERBY_BASE ?? os.homedir();
}

// Fixed control location, independent of the selected env: always the prod dir.
export function configFile(): string {
  return path.join(baseDir(), '.token-derby', 'config.json');
}

export function selectedEnv(): EnvName {
  try {
    const raw = readFileSync(configFile(), 'utf8');
    const parsed = JSON.parse(raw) as { env?: unknown };
    if (parsed.env === 'prod' || parsed.env === 'staging') return parsed.env;
    return 'prod';
  } catch {
    return 'prod';
  }
}

export function setSelectedEnv(env: EnvName): void {
  const file = configFile();
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ env }, null, 2) + '\n', 'utf8');
}
