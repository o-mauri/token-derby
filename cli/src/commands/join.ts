import React from 'react';
import { render } from 'ink';
import type { HorseColors, StableHorse } from '@token-derby/shared';
import { isModelKey, type ModelKey } from '@token-derby/shared';
import { HorsePicker } from '../ui/HorsePicker.js';
import { PrimaryPicker } from '../ui/PrimaryPicker.js';
import { joinRace, getRace, listStable, listOrganisations } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { saveActiveRace, type ActiveRace } from '../stable/active-race.js';
import { RunRace, buildInitialState } from '../runtime/run-race.js';
import { loadIdentity } from '../identity/identity.js';

/** Parse `--primary <model>` or `--primary=<model>` from argv. Throws on a bad value. */
export function parsePrimaryFlag(argv: string[]): ModelKey | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    let value: string | undefined;
    if (a === '--primary') value = argv[i + 1];
    else if (a.startsWith('--primary=')) value = a.slice('--primary='.length);
    else continue;
    if (!isModelKey(value)) throw new Error(`--primary must be one of claude, codex, gemini (got ${value ?? ''})`);
    return value;
  }
  return null;
}

export async function joinCommand(joinCode: string | undefined, argv: string[] = []): Promise<number> {
  if (!joinCode) {
    console.error('Usage: token-derby join <join-code>');
    return 2;
  }
  const code = joinCode.toUpperCase();

  let primaryFlag: ModelKey | null;
  try {
    primaryFlag = parsePrimaryFlag(argv);
  } catch (e) {
    console.error((e as Error).message);
    return 2;
  }

  const identity = await loadIdentity();
  if (!identity) {
    // Defensive — bin.ts already checks. Kept so this command is self-contained.
    console.error('Run `token-derby init` to set up your identity.');
    return 1;
  }

  // Pre-flight: fetch the race view to detect whether this user is already in it.
  let race;
  try {
    race = await getRace(code);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'RACE_NOT_FOUND') console.error(`No race with join code ${code}.`);
      else console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }
  if (race.status === 'finished') {
    console.error('This race has already ended.');
    return 1;
  }

  const ownHorse = race.horses.find(h => h.user_id === identity.user_id) ?? null;

  let chosenStableHorseId: string;
  let chosenName: string;
  let chosenColors: HorseColors;

  if (ownHorse) {
    // Auto-resume: use server's snapshot of the horse, no picker.
    chosenStableHorseId = ownHorse.stable_horse_id;
    chosenName = ownHorse.name;
    chosenColors = ownHorse.colors;
  } else {
    // For org-restricted races, surface NOT_ORG_MEMBER before walking the user
    // through stable/picker flows — otherwise the first thing they see is
    // "Your stable is empty" or a horse picker, hiding the real reason the
    // join will fail. The server still enforces this on POST /join.
    if (race.org_id) {
      try {
        const { organisations } = await listOrganisations();
        if (!organisations.some(o => o.org_id === race.org_id)) {
          const label = race.organisation_name ?? race.org_id;
          console.error(`This race is restricted to members of "${label}".`);
          return 1;
        }
      } catch {
        // If we can't reach the orgs endpoint, fall through and let the
        // join API enforce membership — server is source of truth.
      }
    }

    let horses: StableHorse[];
    try {
      horses = (await listStable()).horses;
    } catch (e) {
      if (e instanceof ApiError) {
        console.error(`Error: ${e.code} ${e.message}`);
        return 1;
      }
      throw e;
    }
    if (horses.length === 0) {
      console.error('Your stable is empty. Run `token-derby stable create` first.');
      return 1;
    }
    const picked = await pickHorse(horses);
    if (!picked) { console.log('Cancelled.'); return 1; }
    chosenStableHorseId = picked.stable_horse_id;
    chosenName = picked.name;
    chosenColors = picked.colors;
  }

  let chosenPrimary: ModelKey = 'claude';
  if (!ownHorse) {
    if (primaryFlag) chosenPrimary = primaryFlag;
    else if (process.stdout.isTTY) chosenPrimary = await pickPrimary();
    // else: leave as 'claude' (non-interactive default)
  }

  let joinResp;
  try {
    joinResp = await joinRace(code, { stable_horse_id: chosenStableHorseId, primary_model: chosenPrimary });
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'RACE_FULL') console.error('This race is full.');
      else if (e.code === 'RACE_FINISHED') console.error('This race has ended.');
      else if (e.code === 'RACE_NOT_FOUND') console.error(`No race with join code ${code}.`);
      else if (e.code === 'VERSION_MISMATCH') console.error(e.message);
      else if (e.code === 'DUPLICATE_HORSE') console.error(e.message);
      else if (e.code === 'STABLE_HORSE_NOT_FOUND') {
        console.error('That horse no longer exists in your stable. Try again.');
      }
      else if (e.code === 'NOT_ORG_MEMBER') console.error(e.message);
      else console.error(`Error: ${e.code} ${e.message}`);
      return 1;
    }
    throw e;
  }

  const status: 'pending' | 'live' = race.status;
  const active: ActiveRace = {
    join_code: code,
    race_id: race.race_id,
    horse_id: joinResp.horse_id,
    heartbeat_token: joinResp.heartbeat_token,
    horse_name: chosenName,
    horse_colors: chosenColors,
    joined_at: ownHorse?.joined_at ?? new Date().toISOString(),
    last_heartbeat_at: new Date(0).toISOString(),
    primary_model: joinResp.primary_model,
    score: {
      acked: { claude: 0, codex: 0, gemini: 0 },
      lastGood: { claude: 0, codex: 0, gemini: 0 },
      seq: ownHorse?.last_seq ?? 0,
    },
    ...(race.counts_input ? { counts_input: true } : {}),
  };
  await saveActiveRace(active);

  const initial = await buildInitialState({ active, raceStatus: status, serverLastSeq: ownHorse?.last_seq ?? 0 });
  const app = render(React.createElement(RunRace, { active, initialState: initial.initialState, pendingMode: initial.pendingMode, ownUserName: identity.display_name }));
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

async function pickPrimary(): Promise<ModelKey> {
  return new Promise(resolve => {
    const app = render(
      React.createElement(PrimaryPicker, {
        onPick: (m: ModelKey) => { app.unmount(); resolve(m); },
      }),
    );
  });
}
