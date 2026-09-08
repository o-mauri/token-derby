import { selectedEnv, type EnvName } from './env/env.js';

export const ENVIRONMENTS: Record<EnvName, { apiBase: string }> = {
  prod: { apiBase: 'https://token-derby.mauricode.co.uk/api' },
  staging: { apiBase: 'https://token-derby-staging.mauricode.co.uk/api' },
};

export function apiBase(): string {
  return process.env.TOKEN_DERBY_API_BASE ?? ENVIRONMENTS[selectedEnv()].apiBase;
}

export const HEARTBEAT_INTERVAL_MS = 60_000;

// A token scan gets most of the beat it belongs to, but must finish before the
// next one starts. Derived from the interval so the two can't drift apart.
export const SCAN_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 0.75;
// Pi is optional at join. A slow or blocked history must not hold the picker or
// post-join baseline hostage, especially when a built-in source was selected.
export const OPTIONAL_PI_SCAN_TIMEOUT_MS = 10_000;
export const HEARTBEAT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
