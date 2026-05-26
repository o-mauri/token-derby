import React from 'react';
import { render } from 'ink';
import { levelFromXp } from '@token-derby/shared';
import { HorseCreator } from '../ui/HorseCreator.js';
import { HatPicker } from '../ui/HatPicker.js';
import { listStable, updateStableHorse, equipHat } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function stableEditCommand(name: string | undefined): Promise<number> {
  if (!name) {
    console.error('Usage: token-derby stable edit <name>');
    return 2;
  }

  const horses = await fetchStable();
  if (!horses) return 1;
  const existing = horses.find(h => h.name === name);
  if (!existing) {
    console.error(`No horse named "${name}" in your stable.`);
    return 1;
  }

  let exitCode = 0;
  const app = render(
    React.createElement(HorseCreator, {
      initialColors: existing.colors,
      initialName: existing.name,
      lockName: true,
      initialLevel: levelFromXp(existing.xp),
      onSubmit: async (_name, colors) => {
        try {
          await updateStableHorse(existing.stable_horse_id, { colors });
          app.unmount();
          console.log(`✓ Updated "${existing.name}".`);
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

  if (exitCode === 0 && existing.hats && existing.hats.length > 0) {
    const equipResult = await new Promise<{ done: boolean; idx: number | null }>(resolve => {
      const app2 = render(
        React.createElement(HatPicker, {
          hats: existing.hats!,
          equipped: existing.equipped_hat ?? null,
          colors: existing.colors,
          onPick: (idx) => { app2.unmount(); resolve({ done: true, idx }); },
          onCancel: () => { app2.unmount(); resolve({ done: false, idx: null }); },
        }),
      );
    });
    if (equipResult.done) {
      try {
        await equipHat(existing.stable_horse_id, { hat_index: equipResult.idx });
        console.log(equipResult.idx === null ? 'Hat unequipped.' : 'Hat equipped.');
      } catch (e) {
        if (e instanceof ApiError) console.error(`Equip failed: ${e.code} ${e.message}`);
        else throw e;
      }
    }
  }

  return exitCode;
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
