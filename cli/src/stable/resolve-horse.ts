import type { StableHorse } from '@token-derby/shared';
import { levelFromXp } from '@token-derby/shared';
import { loadPrefs } from './prefs.js';

export type ResolvedVia = 'flag' | 'default' | 'only';

export type HorseChoice =
  /** Settled without asking. `via` says which rule settled it, for the notice. */
  | { kind: 'resolved'; horse: StableHorse; via: ResolvedVia }
  /** Caller should mount its picker. */
  | { kind: 'pick' }
  /** --horse named a horse that is not in the stable. */
  | { kind: 'not_found'; name: string }
  /** A picker is the only way left, and this process has no terminal to draw it on. */
  | { kind: 'no_tty' }
  | { kind: 'empty' };

export type ResolveOptions = {
  /** Value of --horse, an exact horse name. */
  name?: string | undefined;
  /** --pick: ignore the stored default and choose by hand this once. */
  pick?: boolean | undefined;
  /**
   * Whether the stored default and the single-horse shortcut may settle this.
   * Off for commands where the picker is also a confirmation step — see the
   * call in roll.ts, which spends a consumable.
   */
  autoSelect?: boolean | undefined;
};

/**
 * Which horse a command should act on, before any UI is mounted.
 *
 * Order: --horse wins, then --pick forces the picker, then the stored default,
 * then a stable of one. An explicit flag always beats stored state, and stored
 * state always beats guessing.
 */
export async function resolveHorse(
  horses: StableHorse[],
  opts: ResolveOptions = {},
): Promise<HorseChoice> {
  if (horses.length === 0) return { kind: 'empty' };

  if (opts.name !== undefined) {
    // Exact match, as `stable edit`/`stable delete` already do for their names.
    const found = horses.find(h => h.name === opts.name);
    return found ? { kind: 'resolved', horse: found, via: 'flag' } : { kind: 'not_found', name: opts.name };
  }

  if (opts.pick) return interactive() ? { kind: 'pick' } : { kind: 'no_tty' };

  if (opts.autoSelect !== false) {
    const { default_stable_horse_id } = await loadPrefs();
    if (default_stable_horse_id !== undefined) {
      // A default pointing at a deleted horse is stale, not an error: fall
      // through to the remaining rules rather than stopping the command.
      const found = horses.find(h => h.stable_horse_id === default_stable_horse_id);
      if (found) return { kind: 'resolved', horse: found, via: 'default' };
    }
    if (horses.length === 1) return { kind: 'resolved', horse: horses[0]!, via: 'only' };
  }

  return interactive() ? { kind: 'pick' } : { kind: 'no_tty' };
}

/**
 * Ink needs raw mode on stdin, which only a real terminal provides. Without
 * this check a non-interactive run (a pipe, CI, an agent's shell) crashes deep
 * inside Ink's reconciler with a stack trace instead of saying what is wrong.
 */
export function interactive(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

export function describeHorse(horse: StableHorse): string {
  return `${horse.name} [Lvl. ${levelFromXp(horse.xp)}]`;
}

/**
 * The line a command prints when it settled the choice itself. Naming the horse
 * matters most when the user did not: a silent pick leaves them unsure which
 * horse just received the item.
 */
export function noticeFor(choice: Extract<HorseChoice, { kind: 'resolved' }>): string | null {
  if (choice.via === 'flag') return null; // they named it; echoing adds nothing
  const which = choice.via === 'default' ? 'your default horse' : 'your only horse';
  return `Using ${which}: ${describeHorse(choice.horse)}\n(--horse <name> to pick another, --pick to choose)`;
}

/** Shared wording for the case where a picker was needed but cannot be drawn. */
export function noTtyMessage(command: string): string {
  return [
    `\`${command}\` needs to know which horse, and this is not an interactive terminal.`,
    'Pass --horse <name>, or set a default with `token-derby stable default <name>`.',
  ].join('\n');
}
