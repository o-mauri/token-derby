import { selectedEnv, type EnvName } from './env/env.js';

export const ENVIRONMENTS: Record<EnvName, { apiBase: string }> = {
  prod: { apiBase: 'https://token-derby.mauricode.co.uk/api' },
  staging: { apiBase: 'https://token-derby-staging.mauricode.co.uk/api' },
};

export function apiBase(): string {
  return process.env.TOKEN_DERBY_API_BASE ?? ENVIRONMENTS[selectedEnv()].apiBase;
}

// Racing cadence lives in the engine so the CLI and desktop app share one set.
export {
  HEARTBEAT_INTERVAL_MS,
  SCAN_TIMEOUT_MS,
  HEARTBEAT_RETRY_DELAYS_MS,
} from '@token-derby/token-engine';
