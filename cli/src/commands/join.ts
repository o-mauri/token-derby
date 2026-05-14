import React from 'react';
import { render } from 'ink';
import { loadStable } from '../stable/stable.js';
import { HorsePicker } from '../ui/HorsePicker.js';
import { joinRace, getRace } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { saveActiveRace, type ActiveRace } from '../stable/active-race.js';
import { RunRace, buildInitialState } from '../runtime/run-race.js';
import type { StableHorse } from '../stable/stable.js';

export async function joinCommand(joinCode: string | undefined): Promise<number> {
  if (!joinCode) {
    console.error('Usage: token-derby join <join-code>');
    return 2;
  }
  const code = joinCode.toUpperCase();

  const stable = await loadStable();
  if (stable.horses.length === 0) {
    console.error('Your stable is empty. Run `token-derby stable create` first.');
    return 1;
  }

  const picked = await pickHorse(stable.horses);
  if (!picked) { console.log('Cancelled.'); return 1; }

  let joinResp;
  try {
    joinResp = await joinRace(code, { horse: { name: picked.name, colors: picked.colors } });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'RACE_FULL') console.error(`This race is full.`);
      else if (e.code === 'RACE_FINISHED') console.error('This race has ended.');
      else if (e.code === 'RACE_NOT_FOUND') console.error(`No race with join code ${code}.`);
      else if (e.code === 'VERSION_MISMATCH') console.error(e.message);
      else console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }

  const race = await getRace(code);
  if (race.status === 'finished') {
    console.error('Race finished after join. Exiting.');
    return 1;
  }
  const status: 'pending' | 'live' = race.status;

  const active: ActiveRace = {
    join_code: code,
    race_id: race.race_id,
    horse_id: joinResp.horse_id,
    heartbeat_token: joinResp.heartbeat_token,
    horse_name: picked.name,
    horse_colors: picked.colors,
    joined_at: new Date().toISOString(),
    last_race_tokens: 0,
    last_heartbeat_at: new Date(0).toISOString(),
  };
  await saveActiveRace(active);

  const initial = await buildInitialState({ active, raceStatus: status, rejoin: false });
  const app = render(React.createElement(RunRace, { active, ...initial }));
  await app.waitUntilExit();
  return 0;
}

async function pickHorse(horses: StableHorse[]): Promise<StableHorse | null> {
  return new Promise(resolve => {
    const app = render(
      React.createElement(HorsePicker, {
        horses,
        onPick: (h: StableHorse) => { app.unmount(); resolve(h); },
        onCancel: () => { app.unmount(); resolve(null); },
      }),
    );
  });
}
