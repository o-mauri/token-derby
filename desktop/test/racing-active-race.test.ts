import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { RaceScoreState } from '@token-derby/token-engine';
import type { DesktopActiveRace } from '../electron/racing/active-race.js';

const { loadActiveRace, saveActiveRace, clearActiveRace, activeRacePath } = await import(
  '../electron/racing/active-race.js'
);
const { loadConfig } = await import('../electron/config.js');

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-desktop-race-'));
  process.env.TOKEN_DERBY_DESKTOP_HOME = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_DESKTOP_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
});

function score(): RaceScoreState {
  return {
    acked: { claude: 0, codex: 0, gemini: 0 },
    lastGood: { claude: 0, codex: 0, gemini: 0 },
    primaryConvAcked: {},
    primaryCounted: 0,
    seq: 0,
  };
}

function race(overrides: Partial<DesktopActiveRace> = {}): DesktopActiveRace {
  return {
    join_code: 'ABC123',
    race_id: 'race-1',
    horse_id: 'horse-1',
    heartbeat_token: 'hb-token',
    horse_name: 'Thunder',
    primary_model: 'claude',
    counts_input: false,
    primary_top5: true,
    score: score(),
    last_heartbeat_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('active-race persistence', () => {
  it('loadActiveRace returns null when no file exists', async () => {
    expect(await loadActiveRace()).toBeNull();
  });

  it('round-trips an active race through the temp home', async () => {
    const r = race();
    await saveActiveRace(r);
    expect(await loadActiveRace()).toEqual(r);
  });

  it('activeRacePath resolves under homeDirFor(cfg) as a single fixed file', () => {
    const cfg = loadConfig();
    expect(activeRacePath(cfg)).toBe(path.join(tmp, 'active-race.json'));
  });

  it('saving a second race overwrites the single file (not per-code)', async () => {
    await saveActiveRace(race({ join_code: 'FIRST' }));
    await saveActiveRace(race({ join_code: 'SECOND' }));
    const loaded = await loadActiveRace();
    expect(loaded?.join_code).toBe('SECOND');
  });

  it('clearActiveRace removes the file so load returns null again', async () => {
    await saveActiveRace(race());
    await clearActiveRace();
    expect(await loadActiveRace()).toBeNull();
  });

  it('clearActiveRace is a no-op when nothing is stored', async () => {
    await expect(clearActiveRace()).resolves.toBeUndefined();
  });
});
