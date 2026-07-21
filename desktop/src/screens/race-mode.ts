import type { ActiveRaceStatus } from '../../electron/ipc.js';
import { formatTokens } from '../lib/format.js';

// The active-race LIVE indicator's text, e.g. "P2 · 1.20M" — an unranked
// horse (freshly joined, race still pending) shows an em dash instead of a
// rank rather than "P" followed by nothing.
export function raceStatusLabel(status: ActiveRaceStatus): string {
  const rank = status.rank === null ? '—' : `P${status.rank}`;
  return `${rank} · ${formatTokens(status.tokens)}`;
}
