import React from 'react';
import { render } from 'ink';
import { HorseCreator } from '../ui/HorseCreator.js';
import { upsertHorse, loadStable, findHorse } from '../stable/stable.js';

export async function stableEditCommand(name: string | undefined): Promise<number> {
  if (!name) {
    console.error('Usage: token-derby stable edit <name>');
    return 2;
  }
  const stable = await loadStable();
  const existing = findHorse(stable, name);
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
      onSubmit: async (_name, colors) => {
        await upsertHorse({
          stable_horse_id: existing.stable_horse_id,
          name: existing.name,
          colors,
          created_at: existing.created_at,
        });
        app.unmount();
        console.log(`✓ Updated "${existing.name}".`);
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
