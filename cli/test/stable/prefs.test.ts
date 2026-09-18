import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { prefsFile } from '../../src/paths.js';
import { loadPrefs, savePrefs, setDefaultHorse, clearDefaultHorse } from '../../src/stable/prefs.js';

let tmp: string;

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'td-prefs-'));
  process.env.TOKEN_DERBY_HOME = tmp;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(tmp, { recursive: true, force: true });
});

describe('prefs', () => {
  it('reads as empty before anything is written', async () => {
    expect(await loadPrefs()).toEqual({});
  });

  it('round-trips a default horse', async () => {
    await setDefaultHorse('h1');
    expect(await loadPrefs()).toEqual({ default_stable_horse_id: 'h1' });
  });

  it('creates the home directory on first write', async () => {
    await fs.rm(tmp, { recursive: true, force: true });
    await setDefaultHorse('h1');
    expect(await loadPrefs()).toEqual({ default_stable_horse_id: 'h1' });
  });

  it('clearing removes the key rather than storing undefined', async () => {
    await setDefaultHorse('h1');
    await clearDefaultHorse();
    expect(await loadPrefs()).toEqual({});
    expect(JSON.parse(await fs.readFile(prefsFile(), 'utf8'))).toEqual({});
  });

  // Preferences are a convenience, never a credential: a broken file costs a
  // picker prompt, not the command.
  it.each([
    ['not JSON at all', 'not json {'],
    ['JSON that is not an object', '42'],
    ['null', 'null'],
    ['an array', '[1,2,3]'],
    ['an id of the wrong type', '{"default_stable_horse_id": 7}'],
    ['an empty id', '{"default_stable_horse_id": ""}'],
  ])('degrades to no default on %s', async (_label, contents) => {
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(prefsFile(), contents, 'utf8');
    expect(await loadPrefs()).toEqual({});
  });

  it('preserves keys written by a newer CLI', async () => {
    await fs.mkdir(tmp, { recursive: true });
    await fs.writeFile(prefsFile(), JSON.stringify({ from_the_future: true }), 'utf8');
    await setDefaultHorse('h1');
    const raw = JSON.parse(await fs.readFile(prefsFile(), 'utf8'));
    expect(raw).toEqual({ from_the_future: true, default_stable_horse_id: 'h1' });
  });

  it('savePrefs merges rather than replacing', async () => {
    await setDefaultHorse('h1');
    await savePrefs({});
    expect(await loadPrefs()).toEqual({ default_stable_horse_id: 'h1' });
  });
});
