import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { RaceScoreState } from '@token-derby/token-engine';
import type { ModelKey } from '@token-derby/shared';
import { homeDirFor, loadConfig, type Config } from '../config.js';

// The desktop app races one horse at a time (unlike the CLI, which can join
// several races under different join codes) — so this is a single fixed
// file rather than a per-code directory. Persisting it lets background
// racing survive popover-close and app-restart.
export type DesktopActiveRace = {
  join_code: string;
  race_id: string;
  horse_id: string;
  heartbeat_token: string;
  horse_name: string;
  primary_model: ModelKey;
  counts_input?: boolean;
  primary_top5?: boolean;
  score: RaceScoreState;
  last_heartbeat_at: string;
};

export function activeRacePath(cfg: Config): string {
  return path.join(homeDirFor(cfg), 'active-race.json');
}

export async function loadActiveRace(): Promise<DesktopActiveRace | null> {
  const cfg = loadConfig();
  try {
    const raw = await fs.readFile(activeRacePath(cfg), 'utf8');
    return JSON.parse(raw) as DesktopActiveRace;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null;
    throw e;
  }
}

export async function saveActiveRace(active: DesktopActiveRace): Promise<void> {
  const cfg = loadConfig();
  await fs.mkdir(homeDirFor(cfg), { recursive: true });
  await fs.writeFile(activeRacePath(cfg), JSON.stringify(active, null, 2) + '\n', 'utf8');
}

export async function clearActiveRace(): Promise<void> {
  const cfg = loadConfig();
  try {
    await fs.unlink(activeRacePath(cfg));
  } catch (e: any) {
    if (e?.code !== 'ENOENT') throw e;
  }
}
