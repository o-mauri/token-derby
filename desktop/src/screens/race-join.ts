import type { JoinRaceResult } from '../../electron/ipc.js';

// Whether the user asked to race or only to spectate. Held separately from the
// join outcome so a watched race can never slide into a join.
export type RaceIntent = 'join' | 'watch';

// What the Race screen shows once a join attempt comes back.
export type JoinPhase =
  | { kind: 'racing' }                       // resumed — the active-race panel takes over
  | { kind: 'picker' }                       // not in this race — collect horse + model
  | { kind: 'confirm'; horseName: string };  // racing elsewhere — ask before taking over

export function phaseAfterJoin(result: JoinRaceResult): JoinPhase {
  if ('resumed' in result) return { kind: 'racing' };
  if ('needsConfirm' in result) return { kind: 'confirm', horseName: result.horseName };
  return { kind: 'picker' };
}

export function picksHorse(intent: RaceIntent, phase: JoinPhase | null): boolean {
  return intent === 'join' && phase?.kind === 'picker';
}
