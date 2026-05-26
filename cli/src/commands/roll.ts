import React from 'react';
import { render } from 'ink';
import { levelFromXp, hatById } from '@token-derby/shared';
import type { StableHorse } from '@token-derby/shared';
import { ApiError } from '../api/client.js';
import { listStable, rollHat, equipHat } from '../api/endpoints.js';
import { RollReveal } from '../ui/RollReveal.js';
import { RollHorsePicker } from '../ui/RollHorsePicker.js';

function pendingFor(horse: StableHorse): number {
  const level = levelFromXp(horse.xp);
  const lastRolled = horse.last_rolled_level ?? Math.max(0, level - 1);
  return level - lastRolled;
}

async function promptYesNo(question: string): Promise<boolean> {
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question(question)).trim().toLowerCase();
  rl.close();
  return a === '' || a === 'y' || a === 'yes';
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

  let chosen: StableHorse = eligible[0]!;
  if (eligible.length > 1) {
    const picked = await new Promise<StableHorse | null>(resolve => {
      const app = render(React.createElement(RollHorsePicker, {
        horses: eligible,
        onPick: (h) => { app.unmount(); resolve(h); },
        onCancel: () => { app.unmount(); resolve(null); },
      }));
    });
    if (!picked) { console.log('Cancelled.'); return 0; }
    chosen = picked;
  }

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

    if (result.result === 'hat') {
      const hat = hatById(result.collected.id);
      if (!hat) {
        console.error('Server returned an unknown hat id — catalog mismatch.');
        return 1;
      }
      const variantSuffix = hat.rarity !== 'legendary' && result.collected.variant !== undefined
        ? ` #${result.collected.variant + 1}`
        : '';
      // Multi-phase reveal: box opens → tier-coloured confetti → hat appears.
      // RollReveal calls its onDone callback when the full sequence finishes.
      await new Promise<void>(resolve => {
        const app = render(React.createElement(RollReveal, {
          hat,
          variant: result.collected.variant,
          onDone: () => { app.unmount(); resolve(); },
        }));
      });
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
