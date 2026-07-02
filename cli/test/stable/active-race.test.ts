import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { saveActiveRace, loadActiveRace, deleteActiveRace, listActiveRaces, type ActiveRace } from '../../src/stable/active-race.js';

let home: string | undefined;
afterEach(async () => {
  if (home) { await fs.rm(home, { recursive: true, force: true }); home = undefined; }
  delete process.env.TOKEN_DERBY_HOME;
});
async function tmpHome(): Promise<void> {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-ar-'));
  process.env.TOKEN_DERBY_HOME = home;
}

const sample: ActiveRace = {
  join_code: 'ABCDEF',
  race_id: 'race-1',
  horse_id: 'horse-1',
  heartbeat_token: 'tok',
  horse_name: 'Bolt',
  horse_colors: { body: 'brown', mane: 'black' } as ActiveRace['horse_colors'],
  joined_at: '2026-06-23T00:00:00.000Z',
  last_heartbeat_at: '1970-01-01T00:00:00.000Z',
  primary_model: 'codex',
  score: {
    acked: { claude: 0, codex: 0, gemini: 0 },
    lastGood: { claude: 0, codex: 0, gemini: 0 },
    primaryConvAcked: {},
    primaryCounted: 0,
    seq: 0,
  },
};

describe('active-race persistence', () => {
  it('round-trips a saved active race', async () => {
    await tmpHome();
    await saveActiveRace(sample);
    const loaded = await loadActiveRace('ABCDEF');
    expect(loaded?.primary_model).toBe('codex');
    expect(loaded?.score.seq).toBe(0);
  });

  it('persists per-source score state', async () => {
    await tmpHome();
    await saveActiveRace({
      ...sample,
      score: {
        acked: { claude: 1234, codex: 0, gemini: 0 },
        lastGood: { claude: 1300, codex: 0, gemini: 0 },
        primaryConvAcked: { 'proj/sess': 1300 },
        primaryCounted: 1300,
        seq: 7,
      },
    });
    const loaded = await loadActiveRace('ABCDEF');
    expect(loaded?.score.acked.claude).toBe(1234);
    expect(loaded?.score.lastGood.claude).toBe(1300);
    expect(loaded?.score.seq).toBe(7);
    expect(loaded?.score.primaryConvAcked).toEqual({ 'proj/sess': 1300 });
    expect(loaded?.score.primaryCounted).toBe(1300);
  });

  it('returns null when missing, and lists/deletes', async () => {
    await tmpHome();
    expect(await loadActiveRace('NOPE12')).toBeNull();
    await saveActiveRace(sample);
    expect(await listActiveRaces()).toContain('ABCDEF');
    await deleteActiveRace('ABCDEF');
    expect(await loadActiveRace('ABCDEF')).toBeNull();
  });

  it('round-trips the primary_top5 flag', async () => {
    await tmpHome();
    await saveActiveRace({ ...sample, primary_top5: true });
    const loaded = await loadActiveRace('ABCDEF');
    expect(loaded?.primary_top5).toBe(true);
  });

  it('omits primary_top5 when the race did not set it (default off)', async () => {
    await tmpHome();
    await saveActiveRace(sample);
    const loaded = await loadActiveRace('ABCDEF');
    expect(loaded?.primary_top5).toBeUndefined();
  });
});
