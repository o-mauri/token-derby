import React from 'react';
import { render } from 'ink';
import { HorseCreator } from '../ui/HorseCreator.js';
import { upsertHorse, loadStable, findHorse } from '../stable/stable.js';
import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export async function stableCreateCommand(): Promise<number> {
  let exitCode = 0;
  const app = render(
    React.createElement(HorseCreator, {
      onSubmit: async (name, colors) => {
        const stable = await loadStable();
        const existing = findHorse(stable, name);
        if (existing) {
          app.unmount();
          const rl = readline.createInterface({ input: stdin, output: stdout });
          const answer = (await rl.question(`Horse "${name}" already exists. Overwrite? [y/N] `)).trim().toLowerCase();
          rl.close();
          if (answer !== 'y' && answer !== 'yes') {
            console.log('Cancelled.');
            exitCode = 1;
            return;
          }
        }
        await upsertHorse({ name, colors, created_at: new Date().toISOString() });
        app.unmount();
        console.log(`✓ Saved "${name}" to your stable.`);
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
