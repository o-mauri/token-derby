import { selectedEnv, setSelectedEnv, ENV_NAMES, type EnvName } from '../env/env.js';
import { apiBase } from '../config.js';
import { homeDir } from '../paths.js';

function warnOverrides(): void {
  if (process.env.TOKEN_DERBY_HOME) {
    console.error('Warning: TOKEN_DERBY_HOME overrides the per-env data directory; `env` selection does not change where the identity is stored.');
  }
  if (process.env.TOKEN_DERBY_API_BASE) {
    console.error('Warning: TOKEN_DERBY_API_BASE overrides the API base; `env` selection does not change which API is used.');
  }
}

export function envCommand(arg?: string): number {
  if (!arg) {
    console.log(`Environment: ${selectedEnv()}`);
    console.log(`API base:    ${apiBase()}`);
    console.log(`Data dir:    ${homeDir()}`);
    warnOverrides();
    return 0;
  }
  if (!ENV_NAMES.includes(arg as EnvName)) {
    console.error(`Unknown environment: ${arg}`);
    console.error(`Valid environments: ${ENV_NAMES.join(', ')}`);
    return 2;
  }
  setSelectedEnv(arg as EnvName);
  console.log(`Switched to ${arg}.`);
  console.log(`API base: ${apiBase()}`);
  console.log(`Data dir: ${homeDir()}`);
  warnOverrides();
  return 0;
}
