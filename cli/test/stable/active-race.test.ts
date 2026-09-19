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
  score: {
    convAcked: { anthropic: {}, openai: {}, google: {} },
    counted: { anthropic: 0, openai: 0, google: 0 },
    seq: 0,
  },
};

describe('active-race persistence', () => {
  it('round-trips a saved active race', async () => {
    await tmpHome();
    await saveActiveRace(sample);
    const loaded = await loadActiveRace('ABCDEF');
    expect(loaded?.horse_name).toBe('Bolt');
    expect(loaded?.score.seq).toBe(0);
  });

  it('persists per-source score state', async () => {
    await tmpHome();
    await saveActiveRace({
      ...sample,
      score: {
        convAcked: { anthropic: { 'proj/sess': 1300 }, openai: { 'rollout-1': 42 }, google: {} },
        counted: { anthropic: 1300, openai: 42, google: 0 },
        seq: 7,
      },
    });
    const loaded = await loadActiveRace('ABCDEF');
    expect(loaded?.score.seq).toBe(7);
    expect(loaded?.score.convAcked.anthropic).toEqual({ 'proj/sess': 1300 });
    expect(loaded?.score.convAcked.openai).toEqual({ 'rollout-1': 42 });
    expect(loaded?.score.counted).toEqual({ anthropic: 1300, openai: 42, google: 0 });
  });

  it('returns null when missing, and lists/deletes', async () => {
    await tmpHome();
    expect(await loadActiveRace('NOPE12')).toBeNull();
    await saveActiveRace(sample);
    expect(await listActiveRaces()).toContain('ABCDEF');
    await deleteActiveRace('ABCDEF');
    expect(await loadActiveRace('ABCDEF')).toBeNull();
  });

});
