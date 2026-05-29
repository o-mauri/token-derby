import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadActiveRace,
  saveActiveRace,
  deleteActiveRace,
  listActiveRaces,
  type ActiveRace,
} from '../../src/stable/active-race.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-active-'));
  process.env.TOKEN_DERBY_HOME = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
});

const sample: ActiveRace = {
  join_code: 'K3QP7M',
  race_id: 'r-123',
  horse_id: 'h-456',
  heartbeat_token: 't-789',
  horse_name: 'Gary',
  horse_colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
  joined_at: '2026-04-23T10:00:00Z',
  last_heartbeat_at: '2026-04-23T10:00:00Z',
  ackedReading: 0,
  lastGoodReading: 0,
  seq: 0,
};

describe('active-race', () => {
  it('returns null when no active race file exists', async () => {
    expect(await loadActiveRace('NOPE99')).toBe(null);
  });

  it('saves and loads an active race', async () => {
    await saveActiveRace(sample);
    expect(await loadActiveRace('K3QP7M')).toEqual(sample);
  });

  it('overwrites an existing active race file', async () => {
    await saveActiveRace(sample);
    await saveActiveRace({ ...sample, ackedReading: 5000 });
    const loaded = await loadActiveRace('K3QP7M');
    expect(loaded?.ackedReading).toBe(5000);
  });

  it('round-trips the delta-protocol tracker fields', async () => {
    const active = {
      join_code: 'ABCDEF', race_id: 'r1', horse_id: 'h1', heartbeat_token: 't1',
      horse_name: 'Gary', horse_colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
      joined_at: new Date().toISOString(), last_heartbeat_at: new Date(0).toISOString(),
      ackedReading: 1234, lastGoodReading: 1300, seq: 7,
    };
    await saveActiveRace(active as any);
    const loaded = await loadActiveRace('ABCDEF');
    expect(loaded?.ackedReading).toBe(1234);
    expect(loaded?.lastGoodReading).toBe(1300);
    expect(loaded?.seq).toBe(7);
  });

  it('deletes an active race', async () => {
    await saveActiveRace(sample);
    await deleteActiveRace('K3QP7M');
    expect(await loadActiveRace('K3QP7M')).toBe(null);
  });

  it('deleteActiveRace on a missing code is a no-op', async () => {
    await deleteActiveRace('GONE');
    expect(await loadActiveRace('GONE')).toBe(null);
  });

  it('listActiveRaces returns all join codes with active files', async () => {
    await saveActiveRace(sample);
    await saveActiveRace({ ...sample, join_code: 'OTHER1' });
    const codes = (await listActiveRaces()).sort();
    expect(codes).toEqual(['K3QP7M', 'OTHER1']);
  });

  it('listActiveRaces returns [] when the directory does not exist', async () => {
    expect(await listActiveRaces()).toEqual([]);
  });
});
