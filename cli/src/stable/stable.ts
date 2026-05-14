import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { HorseColors } from '@token-derby/shared';
import { homeDir, stableFile } from '../paths.js';

export type StableHorse = {
  stable_horse_id: string;
  name: string;
  colors: HorseColors;
  created_at: string;
};

export type Stable = {
  horses: StableHorse[];
};

export function newStableHorseId(): string {
  return randomUUID();
}

export async function loadStable(): Promise<Stable> {
  try {
    const raw = await fs.readFile(stableFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.horses)) return { horses: [] };
    const stable = parsed as { horses: Array<Partial<StableHorse> & { name: string; colors: HorseColors; created_at: string }> };
    let mutated = false;
    const horses: StableHorse[] = stable.horses.map(h => {
      if (typeof h.stable_horse_id === 'string' && h.stable_horse_id.length > 0) {
        return h as StableHorse;
      }
      mutated = true;
      return { ...h, stable_horse_id: newStableHorseId() } as StableHorse;
    });
    const result: Stable = { horses };
    if (mutated) await saveStable(result);
    return result;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return { horses: [] };
    if (e instanceof SyntaxError) return { horses: [] };
    throw e;
  }
}

export async function saveStable(stable: Stable): Promise<void> {
  await fs.mkdir(homeDir(), { recursive: true });
  await fs.writeFile(stableFile(), JSON.stringify(stable, null, 2) + '\n', 'utf8');
}

export async function upsertHorse(horse: StableHorse): Promise<void> {
  const stable = await loadStable();
  const idx = stable.horses.findIndex(h => h.name === horse.name);
  if (idx >= 0) stable.horses[idx] = horse;
  else stable.horses.push(horse);
  await saveStable(stable);
}

export async function removeHorse(name: string): Promise<void> {
  const stable = await loadStable();
  stable.horses = stable.horses.filter(h => h.name !== name);
  await saveStable(stable);
}

export function findHorse(stable: Stable, name: string): StableHorse | undefined {
  return stable.horses.find(h => h.name === name);
}
