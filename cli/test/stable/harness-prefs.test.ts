import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadPrefs, savePrefs, setHarnessEnabled, isHarnessEnabled, enabledHarnesses } from '../../src/stable/prefs.js';
import { HARNESSES } from '../../src/tokens/harnesses/registry.js';
import { prefsFile } from '../../src/paths.js';

let home: string;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-hprefs-'));
  process.env.TOKEN_DERBY_HOME = home;
});

afterEach(async () => {
  delete process.env.TOKEN_DERBY_HOME;
  await fs.rm(home, { recursive: true, force: true });
});

const writeRaw = (obj: unknown) => fs.writeFile(prefsFile(), JSON.stringify(obj, null, 2), 'utf8');
const readRaw = async () => JSON.parse(await fs.readFile(prefsFile(), 'utf8'));

describe('harness defaults', () => {
  it('counts the long-standing agents without anyone opting in', async () => {
    expect(enabledHarnesses(await loadPrefs())).toEqual(['claude-code', 'codex-cli', 'gemini-cli']);
  });

  it('every shipped harness declares whether it counts by default', () => {
    for (const harness of Object.values(HARNESSES)) {
      expect(typeof harness.enabledByDefault).toBe('boolean');
    }
  });

  it('falls back to each harness\'s own declared default when no choice is stored', async () => {
    // Covers a harness that ships OFF the moment one is added, without this
    // test needing to know which ones those are.
    const prefs = await loadPrefs();
    for (const [key, harness] of Object.entries(HARNESSES)) {
      expect(isHarnessEnabled(prefs, key as keyof typeof HARNESSES)).toBe(harness.enabledByDefault);
    }
  });

  it('an explicit choice beats the declared default in both directions', async () => {
    await setHarnessEnabled('codex-cli', false);   // default is on
    expect(isHarnessEnabled(await loadPrefs(), 'codex-cli')).toBe(false);
    await setHarnessEnabled('codex-cli', true);
    expect(isHarnessEnabled(await loadPrefs(), 'codex-cli')).toBe(true);
  });
});

describe('harness choices', () => {
  it('round-trips a disabled agent', async () => {
    await setHarnessEnabled('codex-cli', false);
    const prefs = await loadPrefs();
    expect(isHarnessEnabled(prefs, 'codex-cli')).toBe(false);
    expect(isHarnessEnabled(prefs, 'claude-code')).toBe(true);
    expect(enabledHarnesses(prefs)).toEqual(['claude-code', 'gemini-cli']);
  });

  it('re-enabling counts it again', async () => {
    await setHarnessEnabled('codex-cli', false);
    await setHarnessEnabled('codex-cli', true);
    expect(isHarnessEnabled(await loadPrefs(), 'codex-cli')).toBe(true);
  });

  it('records a choice even when it matches the current default', async () => {
    // So that changing a default later cannot overturn what was asked for.
    await setHarnessEnabled('codex-cli', true);
    expect((await readRaw()).harnesses).toEqual({ 'codex-cli': true });
  });

  it('ignores an agent this version does not know, rather than guessing', async () => {
    await writeRaw({ harnesses: { 'codex-cli': false, 'some-future-agent': true } });
    expect((await loadPrefs()).harnesses).toEqual({ 'codex-cli': false });
  });

  it('preserves a choice written by a newer CLI when toggling another', async () => {
    await writeRaw({ harnesses: { 'some-future-agent': true } });
    await setHarnessEnabled('codex-cli', false);
    expect((await readRaw()).harnesses).toEqual({ 'some-future-agent': true, 'codex-cli': false });
  });

  it('ignores a non-boolean choice', async () => {
    await writeRaw({ harnesses: { 'codex-cli': 'yes' } });
    expect(enabledHarnesses(await loadPrefs())).toHaveLength(3);
  });

  it('keeps the default horse when toggling an agent', async () => {
    await savePrefs({ default_stable_horse_id: 'horse-1' });
    await setHarnessEnabled('gemini-cli', false);
    const prefs = await loadPrefs();
    expect(prefs.default_stable_horse_id).toBe('horse-1');
    expect(isHarnessEnabled(prefs, 'gemini-cli')).toBe(false);
  });

  it('a corrupt prefs file falls back to the defaults rather than counting nothing', async () => {
    await fs.writeFile(prefsFile(), '{ not json', 'utf8');
    expect(enabledHarnesses(await loadPrefs())).toHaveLength(3);
  });

  it('a non-object harnesses value is ignored', async () => {
    await writeRaw({ harnesses: ['codex-cli'] });
    expect(enabledHarnesses(await loadPrefs())).toHaveLength(3);
  });
});
