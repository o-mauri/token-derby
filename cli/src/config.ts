export const API_BASE = 'https://token-derby.mauricode.co.uk/api';

/** TOKEN_DERBY_API_BASE points the CLI at a local or alternate API. */
export function apiBase(): string {
  return process.env.TOKEN_DERBY_API_BASE ?? API_BASE;
}

export const HEARTBEAT_INTERVAL_MS = 60_000;

// A token scan gets most of the beat it belongs to, but must finish before the
// next one starts. Derived from the interval so the two can't drift apart.
export const SCAN_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 0.75;
export const HEARTBEAT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];

// Consecutive beats in which NO source finds any conversation before the status
// panel says so. A missing or misplaced history directory reads as "produced 0
// tokens" rather than as an error, so nothing else would ever surface it.
export const SILENT_THRESHOLD = 10;
