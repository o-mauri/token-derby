import React from 'react';
import { render } from 'ink';
import { loadActiveRace } from '../stable/active-race.js';
import { getRace } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { RunRace, buildInitialState } from '../runtime/run-race.js';

export async function rejoinCommand(joinCode: string | undefined): Promise<number> {
  if (!joinCode) {
    console.error('Usage: token-derby rejoin <join-code>');
    return 2;
  }
  const code = joinCode.toUpperCase();

  const active = await loadActiveRace(code);
  if (!active) {
    console.error(`No saved active-race state for ${code}. Use \`token-derby join ${code}\` to enter as a new horse.`);
    return 1;
  }

  let race;
  try {
    race = await getRace(code);
  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
  if (race.status === 'finished') {
    console.error('Race already finished.');
    return 1;
  }
  const status: 'pending' | 'live' = race.status;

  const initial = await buildInitialState({ active, raceStatus: status, rejoin: true });
  const app = render(React.createElement(RunRace, { active, ...initial }));
  await app.waitUntilExit();
  return 0;
}
