import React from 'react';
import { render } from 'ink';
import { levelFromXp, type StableHorse } from '@token-derby/shared';
import { HorseCreator } from '../ui/HorseCreator.js';
import { HorsePicker } from '../ui/HorsePicker.js';
import { listStable, updateStableHorse, equipHat } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function stableEditCommand(name: string | undefined): Promise<number> {
  const horses = await fetchStable();
  if (!horses) return 1;

  const existing = await pickHorseToEdit(horses, name);
  if (existing === 'not_found') {
    console.error(`No horse named "${name}" in your stable.`);
    return 1;
  }
  if (existing === 'empty') {
    console.log('No horses in your stable. Run `token-derby stable create` to make one.');
    return 0;
  }
  if (existing === 'cancelled') {
    console.log('Cancelled.');
    return 1;
  }

  const initialEquipped: number | null = existing.equipped_hat ?? null;
  let exitCode = 0;
  const app = render(
    React.createElement(HorseCreator, {
      initialColors: existing.colors,
      initialName: existing.name,
      lockName: true,
      initialLevel: levelFromXp(existing.xp),
      hats: existing.hats,
      initialEquipped,
      onSubmit: async (_name, colors, hatChoice) => {
        const colorsChanged = !sameColors(colors, existing.colors);
        const hatChanged = hatChoice !== undefined && hatChoice !== initialEquipped;
        try {
          if (colorsChanged) await updateStableHorse(existing.stable_horse_id, { colors });
          if (hatChanged) await equipHat(existing.stable_horse_id, { hat_index: hatChoice });
          app.unmount();
          if (!colorsChanged && !hatChanged) {
            console.log(`No changes for "${existing.name}".`);
          } else {
            const parts: string[] = [];
            if (colorsChanged) parts.push('colors');
            if (hatChanged) parts.push(hatChoice === null ? 'hat unequipped' : 'hat equipped');
            console.log(`✓ Updated "${existing.name}" (${parts.join(', ')}).`);
          }
        } catch (e) {
          app.unmount();
          if (e instanceof ApiError) {
            console.error(`Error: ${e.code} ${e.message}`);
            exitCode = 1;
            return;
          }
          throw e;
        }
      },
      onCancel: () => {
        app.unmount();
        console.log('Cancelled.');
        exitCode = 1;
      },
    }),
  );
  await app.waitUntilExit();

  return exitCode;
}

function sameColors(a: StableHorse['colors'], b: StableHorse['colors']): boolean {
  return a.body === b.body && a.mane === b.mane && a.tail === b.tail && a.saddle === b.saddle;
}

async function fetchStable() {
  try {
    const resp = await listStable();
    return resp.horses;
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return null;
    }
    throw e;
  }
}

async function pickHorseToEdit(
  horses: StableHorse[],
  name: string | undefined,
): Promise<StableHorse | 'not_found' | 'empty' | 'cancelled'> {
  if (name) {
    const found = horses.find(h => h.name === name);
    return found ?? 'not_found';
  }
  if (horses.length === 0) return 'empty';
  const picked = await new Promise<StableHorse | null>(resolve => {
    const app = render(
      React.createElement(HorsePicker, {
        horses,
        onPick: (h: StableHorse) => { app.unmount(); resolve(h); },
        onCancel: () => { app.unmount(); resolve(null); },
      }),
    );
  });
  return picked ?? 'cancelled';
}
