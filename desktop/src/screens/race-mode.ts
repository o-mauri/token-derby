import type { ActiveRaceStatus } from '../../electron/ipc.js';
import { formatTokens } from '../lib/format.js';
import type { Standing } from './race-standings.js';

// The active-race LIVE indicator's text, e.g. "P2 · 1.20M" — an unranked
// horse (freshly joined, race still pending) shows an em dash instead of a
// rank rather than "P" followed by nothing.
export function raceStatusLabel(status: ActiveRaceStatus): string {
  const rank = status.rank === null ? '—' : `P${status.rank}`;
  return `${rank} · ${formatTokens(status.tokens)}`;
}

// Whether the horse-picker/Race button should show for the race currently
// being spectated, as opposed to the active-race panel (highlighted horse,
// Stop racing, Open race track). horse_id is scoped to a single race (see
// race-standings.ts), so activeRace's horse only turns up in `standings` when
// these standings belong to the very race that horse is racing in — including
// the brief window right after starting a race, before the next `getRace`
// poll catches up with the new join code.
export function canRace(standings: Standing[], activeRace: ActiveRaceStatus | null): boolean {
  if (!activeRace) return true;
  return !standings.some((s) => s.horse_id === activeRace.horseId);
}
