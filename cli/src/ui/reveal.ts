import React from 'react';
import { render } from 'ink';
import { RollReveal, type RollOutcome } from './RollReveal.js';

/** Closed box → suspense beat → open/reveal animation, all in one Ink mount. */
export async function runReveal(outcome: RollOutcome): Promise<void> {
  await new Promise<void>(resolve => {
    const app = render(React.createElement(RollReveal, {
      outcome,
      onDone: () => { app.unmount(); resolve(); },
    }));
  });
}
