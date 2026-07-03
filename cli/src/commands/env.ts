import { selectedEnv, setSelectedEnv, ENV_NAMES, type EnvName } from '../env/env.js';
import { apiBase } from '../config.js';
import { homeDir } from '../paths.js';

export function envCommand(arg?: string): number {
  if (!arg) {
    console.log(`Environment: ${selectedEnv()}`);
    console.log(`API base:    ${apiBase()}`);
    console.log(`Data dir:    ${homeDir()}`);
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
  return 0;
}
