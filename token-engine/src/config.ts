// Racing cadence. The engine owns these because it owns both the heartbeat loop
// and the token scan that has to fit inside a beat — the CLI and the desktop app
// re-export rather than redeclare them, so the two clients can't drift apart.

export const HEARTBEAT_INTERVAL_MS = 60_000;

// A token scan gets most of the beat it belongs to, but must finish before the
// next one starts. Derived from the interval so the two can't drift apart.
export const SCAN_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 0.75;

export const HEARTBEAT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
