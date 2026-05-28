import React from 'react';
import { render } from 'ink';
import { levelFromXp, hatById } from '@token-derby/shared';
import type { StableHorse } from '@token-derby/shared';
import { ApiError } from '../api/client.js';
import { listStable, rollHat, equipHat } from '../api/endpoints.js';
import { RollReveal, type RollOutcome } from '../ui/RollReveal.js';
import { RollHorsePicker } from '../ui/RollHorsePicker.js';

function pendingFor(horse: StableHorse): number {
  const level = levelFromXp(horse.xp);
  const lastRolled = horse.last_rolled_level ?? Math.max(0, level - 1);
  return level - lastRolled;
}

async function promptYesNo(question: string): Promise<boolean> {
  resetStdinAfterInk();
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return a === '' || a === 'y' || a === 'yes';
}

/**
 * After an Ink mount unmounts, stdin is left in a state where readline
 * mis-behaves:
 *   1. Ink calls `stdin.unref()` in its raw-mode teardown, so with no
 *      other pending I/O the event loop exits as soon as we await
 *      readline's `question` — the prompt prints, the process drops to
 *      the shell, and the user never gets to answer.
 *   2. Ink may have buffered bytes its useInput didn't consume; those
 *      would auto-resolve readline's first read.
 * Reset to a known-clean, ref'd state before any readline prompt.
 */
function resetStdinAfterInk(): void {
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(false);
  }
  // Drain any buffered bytes the picker's useInput didn't consume.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  while (process.stdin.read() !== null) { /* discard */ }
  process.stdin.pause();
  // Re-ref stdin so readline's await actually keeps the process alive.
  process.stdin.ref();
}

/** Closed box → 3s suspense beat → open/reveal animation, all in one Ink mount. */
async function runReveal(outcome: RollOutcome): Promise<void> {
  await new Promise<void>(resolve => {
    const app = render(React.createElement(RollReveal, {
      outcome,
      onDone: () => { app.unmount(); resolve(); },
    }));
  });
}

export async function rollCommand(): Promise<number> {
  let stable;
  try {
    stable = await listStable();
  } catch (e) {
    if (e instanceof ApiError) { console.error(`Error: ${e.code} ${e.message}`); return 1; }
    throw e;
  }

  const eligible = stable.horses
    .map(h => ({ ...h, pending: pendingFor(h) }))
    .filter(h => h.pending > 0);

  if (eligible.length === 0) {
    console.log('No rolls available. Level up a horse to earn a roll!');
    return 0;
  }

  // Always show the picker, even with one eligible horse — it doubles as
  // a confirmation step so the user can back out before spending a roll.
  const picked = await new Promise<StableHorse | null>(resolve => {
    const app = render(React.createElement(RollHorsePicker, {
      horses: eligible,
      onPick: (h) => { app.unmount(); resolve(h); },
      onCancel: () => { app.unmount(); resolve(null); },
    }));
  });
  if (!picked) { console.log('Cancelled.'); return 0; }
  let chosen: StableHorse = picked;

  while (true) {
    let result;
    try {
      result = await rollHat(chosen.stable_horse_id);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'INSUFFICIENT_ROLLS') { console.log('No more rolls available.'); return 0; }
        console.error(`Error: ${e.code} ${e.message}`); return 1;
      }
      throw e;
    }

    // Build a tier-agnostic outcome shape for RollReveal. The closed box is
    // the same colour for every outcome — rarity only reveals during the
    // confetti burst (and is absent entirely for no_hat).
    const outcome: RollOutcome | null = (() => {
      if (result.result === 'hat') {
        const hat = hatById(result.collected.id);
        if (!hat) return null;
        return { kind: 'hat', hat, variant: result.collected.variant };
      }
      if (result.result === 'duplicate') {
        const hat = hatById(result.hat_id);
        if (!hat) return null;
        return { kind: 'duplicate', hat, variant: result.variant };
      }
      return { kind: 'no_hat' };
    })();
    if (!outcome) {
      console.error('Server returned an unknown hat id — catalog mismatch.');
      return 1;
    }

    // Closed box + Enter prompt, then the open/burst/reveal animation.
    await runReveal(outcome);

    if (result.result === 'hat') {
      const hat = hatById(result.collected.id)!;
      const variantSuffix = hat.rarity !== 'legendary' && result.collected.variant !== undefined
        ? ` #${result.collected.variant + 1}`
        : '';
      console.log(`\n✨ ${hat.name}${variantSuffix} [${hat.rarity.toUpperCase()}]\n`);
      if (await promptYesNo('Equip now? [Y/n] ')) {
        try {
          await equipHat(chosen.stable_horse_id, { hat_index: result.hat_index });
          console.log(`Equipped on ${chosen.name}.`);
        } catch (e) {
          if (e instanceof ApiError) { console.error(`Equip failed: ${e.code} ${e.message}`); }
          else throw e;
        }
      }
    } else if (result.result === 'duplicate') {
      const hat = hatById(result.hat_id);
      const variantSuffix = result.variant !== undefined ? ` #${result.variant + 1}` : '';
      console.log(`\nYou already have ${hat?.name ?? result.hat_id}${variantSuffix}. +${result.xp_awarded} XP.\n`);
    } else {
      console.log(`\nNo hat this time. +${result.xp_awarded} XP toward your next level.\n`);
    }

    if (result.remaining_rolls <= 0) return 0;
    if (!(await promptYesNo(`${result.remaining_rolls} more roll${result.remaining_rolls === 1 ? '' : 's'} available. Roll again? [Y/n] `))) return 0;
  }
}
