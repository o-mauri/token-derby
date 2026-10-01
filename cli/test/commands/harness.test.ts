import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { harnessListCommand, harnessToggleCommand } from '../../src/commands/harness.js';
import { loadPrefs, isHarnessEnabled } from '../../src/stable/prefs.js';

let home: string;
let out: string[];
let err: string[];

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-hcmd-'));
  process.env.TOKEN_DERBY_HOME = home;
  for (const v of ['CLAUDE', 'CODEX', 'GEMINI']) process.env[`TOKEN_DERBY_${v}_DIR`] = path.join(home, v.toLowerCase());
  out = []; err = [];
  vi.spyOn(console, 'log').mockImplementation((...a) => { out.push(a.join(' ')); });
  vi.spyOn(console, 'error').mockImplementation((...a) => { err.push(a.join(' ')); });
});

afterEach(async () => {
  vi.restoreAllMocks();
  delete process.env.TOKEN_DERBY_HOME;
  for (const v of ['CLAUDE', 'CODEX', 'GEMINI']) delete process.env[`TOKEN_DERBY_${v}_DIR`];
  await fs.rm(home, { recursive: true, force: true });
});

describe('harness list', () => {
  it('lists every agent with its id, so nobody has to guess the spelling', async () => {
    expect(await harnessListCommand()).toBe(0);
    const text = out.join('\n');
    for (const id of ['claude-code', 'codex-cli', 'gemini-cli']) expect(text).toContain(id);
  });

  it('shows on/off state and where each one reads from', async () => {
    await harnessToggleCommand('codex-cli', false);
    out = [];
    await harnessListCommand();
    const text = out.join('\n');
    expect(text).toMatch(/off\s+codex-cli/);
    expect(text).toMatch(/on\s+claude-code/);
    expect(text).toContain(path.join(home, 'codex'));
  });

  it('says when a state is the shipped default rather than a choice', async () => {
    await harnessListCommand();
    expect(out.join('\n')).toContain('(default)');
    out = [];
    await harnessToggleCommand('codex-cli', false);
    out = [];
    await harnessListCommand();
    // The chosen one no longer claims to be a default.
    expect(out.join('\n')).toMatch(/off\s+codex-cli\s+Codex CLI\s*$/m);
  });
});

describe('harness enable / disable', () => {
  it('turns one off and persists it', async () => {
    expect(await harnessToggleCommand('codex-cli', false)).toBe(0);
    expect(isHarnessEnabled(await loadPrefs(), 'codex-cli')).toBe(false);
    expect(out.join('\n')).toMatch(/next heartbeat/);
  });

  it('turns it back on', async () => {
    await harnessToggleCommand('codex-cli', false);
    expect(await harnessToggleCommand('codex-cli', true)).toBe(0);
    expect(isHarnessEnabled(await loadPrefs(), 'codex-cli')).toBe(true);
  });

  it('is a no-op, not an error, when it is already in that state', async () => {
    expect(await harnessToggleCommand('codex-cli', true)).toBe(0);
    expect(out.join('\n')).toMatch(/already/);
  });

  it('rejects an unknown id and lists the valid ones', async () => {
    expect(await harnessToggleCommand('codex', false)).toBe(2);
    expect(err.join('\n')).toContain("Unknown coding agent 'codex'");
    expect(err.join('\n')).toContain('codex-cli');
  });

  it('rejects a missing id with usage', async () => {
    expect(await harnessToggleCommand(undefined, false)).toBe(2);
    expect(err.join('\n')).toMatch(/Usage: token-derby harness disable/);
  });

  it('warns, but allows, turning off the last one', async () => {
    await harnessToggleCommand('claude-code', false);
    await harnessToggleCommand('codex-cli', false);
    out = [];
    expect(await harnessToggleCommand('gemini-cli', false)).toBe(0);
    expect(out.join('\n')).toMatch(/your horse will not move/);
  });
});
