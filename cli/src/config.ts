export const DEFAULT_API_BASE = 'https://token-derby.mauricode.co.uk/api';

export function apiBase(): string {
  return process.env.TOKEN_DERBY_API_BASE ?? DEFAULT_API_BASE;
}

export const HEARTBEAT_INTERVAL_MS = 60_000;
export const POLL_INTERVAL_MS = 3_000;
export const HEARTBEAT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
