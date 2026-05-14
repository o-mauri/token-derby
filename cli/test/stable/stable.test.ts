import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadStable,
  upsertHorse,
  removeHorse,
  findHorse,
  type StableHorse,
} from '../../src/stable/stable.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-stable-'));
  process.env.TOKEN_DERBY_HOME = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
});

const gary: StableHorse = {
  stable_horse_id: '11111111-1111-1111-1111-111111111111',
  name: 'Gary',
  colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  created_at: '2026-04-23T10:00:00Z',
};

describe('stable', () => {
  it('returns empty list when no stable file exists', async () => {
    const stable = await loadStable();
    expect(stable.horses).toEqual([]);
  });

  it('upserts and persists a horse', async () => {
    await upsertHorse(gary);
    const stable = await loadStable();
    expect(stable.horses).toHaveLength(1);
    expect(stable.horses[0]?.name).toBe('Gary');
  });

  it('overwrites a horse with the same name', async () => {
    await upsertHorse(gary);
    await upsertHorse({ ...gary, colors: { ...gary.colors, body: '#FFFFFF' } });
    const stable = await loadStable();
    expect(stable.horses).toHaveLength(1);
    expect(stable.horses[0]?.colors.body).toBe('#FFFFFF');
  });

  it('finds a horse by name', async () => {
    await upsertHorse(gary);
    expect(findHorse(await loadStable(), 'Gary')?.name).toBe('Gary');
    expect(findHorse(await loadStable(), 'Nope')).toBeUndefined();
  });

  it('removes a horse by name', async () => {
    await upsertHorse(gary);
    await upsertHorse({ ...gary, name: 'Pony' });
    await removeHorse('Gary');
    const stable = await loadStable();
    expect(stable.horses.map(h => h.name)).toEqual(['Pony']);
  });

  it('removeHorse on a missing name is a no-op', async () => {
    await removeHorse('Nobody');
    const stable = await loadStable();
    expect(stable.horses).toEqual([]);
  });

  it('returns empty when stable.json is malformed (does not throw)', async () => {
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(path.join(tmp, 'stable.json'), 'not json');
    const stable = await loadStable();
    expect(stable.horses).toEqual([]);
  });

  it('backfills stable_horse_id on load and persists it', async () => {
    await fs.mkdir(tmp, { recursive: true });
    const legacy = {
      horses: [
        { name: 'Legacy', colors: gary.colors, created_at: gary.created_at },
      ],
    };
    await fs.writeFile(path.join(tmp, 'stable.json'), JSON.stringify(legacy));

    const loaded = await loadStable();
    expect(loaded.horses).toHaveLength(1);
    expect(loaded.horses[0]?.stable_horse_id).toMatch(/^[0-9a-f-]{36}$/);

    const reloaded = await loadStable();
    expect(reloaded.horses[0]?.stable_horse_id).toBe(loaded.horses[0]?.stable_horse_id);
  });
});
