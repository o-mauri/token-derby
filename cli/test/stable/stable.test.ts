import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CollectedHat } from '@token-derby/shared';
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
  name: 'Gary',
  colors: { body: '#8B4513', mane: '#000000', tail: '#000000', saddle: '#C0392B' },
  created_at: '2026-04-23T10:00:00Z',
  hats: [],
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

  it('loads a legacy stable file without hats and defaults hats to []', async () => {
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(
      path.join(tmp, 'stable.json'),
      JSON.stringify({ horses: [{ name: 'Legacy', colors: gary.colors, created_at: gary.created_at }] }),
    );
    const stable = await loadStable();
    expect(stable.horses[0]?.hats).toEqual([]);
    expect(stable.horses[0]?.equipped_hat).toBeUndefined();
  });

  it('persists hats and equipped_hat', async () => {
    const hat: CollectedHat = { id: 'flat_cap', tint: '#FF0000', obtained_at: '2026-05-14T00:00:00Z' };
    await upsertHorse({ ...gary, hats: [hat], equipped_hat: 0 });
    const stable = await loadStable();
    expect(stable.horses[0]?.hats).toHaveLength(1);
    expect(stable.horses[0]?.equipped_hat).toBe(0);
  });
});
