import React from 'react';
import { render } from 'ink';
import { HorseCreator } from '../ui/HorseCreator.js';
import { createStableHorse } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';

export async function stableCreateCommand(): Promise<number> {
  let exitCode = 0;
  const app = render(
    React.createElement(HorseCreator, {
      onSubmit: async (name, colors) => {
        try {
          await createStableHorse({ name, colors });
          app.unmount();
          console.log(`✓ Saved "${name}" to your stable.`);
        } catch (e) {
          app.unmount();
          if (e instanceof ApiError) {
            if (e.code === 'STABLE_HORSE_NAME_TAKEN') {
              console.error(`A horse named "${name}" already exists. Pick a different name or use \`token-derby stable edit ${name}\` to modify it.`);
            } else {
              console.error(`Error: ${e.code} ${e.message}`);
            }
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
