import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { HorseColors } from '@token-derby/shared';
import { activeRaceFile, activeRacesDir } from '../paths.js';

export type ActiveRace = {
  join_code: string;
  race_id: string;
  horse_id: string;
  heartbeat_token: string;
  horse_name: string;
  horse_colors: HorseColors;
  joined_at: string;
  last_race_tokens: number;
  last_heartbeat_at: string;
};

export async function loadActiveRace(joinCode: string): Promise<ActiveRace | null> {
  try {
    const raw = await fs.readFile(activeRaceFile(joinCode), 'utf8');
    return JSON.parse(raw) as ActiveRace;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    throw e;
  }
}

export async function saveActiveRace(active: ActiveRace): Promise<void> {
  await fs.mkdir(activeRacesDir(), { recursive: true });
  await fs.writeFile(
    activeRaceFile(active.join_code),
    JSON.stringify(active, null, 2) + '\n',
    'utf8',
  );
}

export async function deleteActiveRace(joinCode: string): Promise<void> {
  try {
    await fs.unlink(activeRaceFile(joinCode));
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e;
  }
}

export async function listActiveRaces(): Promise<string[]> {
  try {
    const entries = await fs.readdir(activeRacesDir());
    return entries
      .filter(f => f.endsWith('.json'))
      .map(f => path.basename(f, '.json'));
  } catch (e: any) {
    if (e?.code === 'ENOENT') return [];
    throw e;
  }
}
