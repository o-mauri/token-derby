import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SourceRootMissing } from '../../src/tokens/source-root.js';
import { ScanProgress } from '../../src/tokens/scan-progress.js';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { setHarnessEnabled } from '../../src/stable/prefs.js';
import type { HarnessKey } from '../../src/tokens/harnesses/harness.js';
import type { CountResult } from '../../src/tokens/harnesses/engine.js';

const counts: Record<HarnessKey, ReturnType<typeof vi.fn>> = {
  'claude-code': vi.fn(),
  'codex-cli': vi.fn(),
  'gemini-cli': vi.fn(),
  pi: vi.fn(),
};

// Mock the engine, not the harnesses: readAllSources' job is merging by family
// and degrading a failure, which is independent of how any file is parsed.
vi.mock('../../src/tokens/harnesses/engine.js', () => ({
  count: (h: { id: HarnessKey }) => counts[h.id](),
}));

const { readAllSources, isStall, scoreFor } = await import('../../src/tokens/race-tokens.js');
import type { AllSources } from '../../src/tokens/race-tokens.js';

/** A CountResult for one family, keyed as the engine would key it. */
function result(family: string, conversations: Record<string, number>, notices: string[] = []): CountResult {
  const map = new Map<string, { input: number; output: number }>();
  for (const [id, output] of Object.entries(conversations)) map.set(id, { input: 0, output });
  return { byFamily: new Map([[family as any, map]]), notices };
}

function allEmpty() {
  for (const fn of Object.values(counts)) fn.mockResolvedValue({ byFamily: new Map(), notices: [] });
}

function ok(r: AllSources | { stall: string }): AllSources {
  if ('stall' in r) throw new Error(`expected a usable reading, got stall: ${r.stall}`);
  return r;
}

let home: string | undefined;

beforeEach(async () => {
  home = await fs.mkdtemp(path.join(os.tmpdir(), 'td-rt-'));
  process.env.TOKEN_DERBY_HOME = home;
});

afterEach(async () => {
  vi.clearAllMocks();
  delete process.env.TOKEN_DERBY_HOME;
  if (home) await fs.rm(home, { recursive: true, force: true });
  home = undefined;
});

describe('scoreFor', () => {
  it('sums input and output', () => {
    expect(scoreFor({ input: 100, output: 20 })).toBe(120);
  });
});

describe('readAllSources', () => {
  it('files each harness under the family it reported', async () => {
    allEmpty();
    counts['claude-code'].mockResolvedValue(result('anthropic', { 'claude-code:a': 100 }));
    counts['codex-cli'].mockResolvedValue(result('openai', { 'codex-cli:r': 50 }));
    counts['gemini-cli'].mockResolvedValue(result('google', { 'gemini-cli:g': 9 }));

    const res = ok(await readAllSources());
    expect(Object.fromEntries(res.byFamily.anthropic)).toEqual({ 'claude-code:a': 100 });
    expect(Object.fromEntries(res.byFamily.openai)).toEqual({ 'codex-cli:r': 50 });
    expect(Object.fromEntries(res.byFamily.google)).toEqual({ 'gemini-cli:g': 9 });
    expect(res.degraded).toEqual([]);
  });

  it('merges several harnesses feeding the same family', async () => {
    // The whole point of the split: Pi will land here alongside Claude Code.
    allEmpty();
    counts['claude-code'].mockResolvedValue(result('anthropic', { 'claude-code:a': 100 }));
    counts['codex-cli'].mockResolvedValue(result('anthropic', { 'codex-cli:b': 40 }));

    const res = ok(await readAllSources());
    expect(Object.fromEntries(res.byFamily.anthropic)).toEqual({ 'claude-code:a': 100, 'codex-cli:b': 40 });
  });

  it('scans every harness concurrently — a beat costs the slowest, not the sum', async () => {
    allEmpty();
    let release!: (r: CountResult) => void;
    counts['claude-code'].mockReturnValue(new Promise((r) => { release = r; }));
    counts['codex-cli'].mockResolvedValue(result('openai', { 'codex-cli:r': 50 }));

    const pending = readAllSources();
    // waitFor rather than a microtask flush: the beat reads prefs before
    // dispatching, so dispatch is a file read away, not a tick away.
    await vi.waitFor(() => {
      expect(counts['codex-cli']).toHaveBeenCalled();
      expect(counts['gemini-cli']).toHaveBeenCalled();
    });

    release(result('anthropic', { 'claude-code:a': 100 }));
    const res = ok(await pending);
    expect(Object.fromEntries(res.byFamily.openai)).toEqual({ 'codex-cli:r': 50 });
  });

  it('records which harnesses are still scanning when a beat runs long', async () => {
    allEmpty();
    counts['claude-code'].mockReturnValue(new Promise(() => {})); // never settles
    const progress = new ScanProgress();
    void readAllSources(progress);
    await vi.waitFor(() => expect(progress.outstanding()).toEqual(['claude-code']));
  });

  it('skips a harness it cannot read, and still counts the others', async () => {
    allEmpty();
    counts['codex-cli'].mockRejectedValue(new Error('EACCES: permission denied'));
    counts['claude-code'].mockResolvedValue(result('anthropic', { 'claude-code:a': 100 }));

    const res = ok(await readAllSources());       // not a stall — the race continues
    expect(res.degraded).toEqual([
      { harness: 'codex-cli', label: 'Codex CLI', message: 'EACCES: permission denied' },
    ]);
    expect(res.byFamily.openai.size).toBe(0);     // skipped, not partially counted
    expect(Object.fromEntries(res.byFamily.anthropic)).toEqual({ 'claude-code:a': 100 });
  });

  it('degrades every failing harness, in registry order', async () => {
    allEmpty();
    counts['codex-cli'].mockRejectedValue(new Error('codex broke'));
    counts['gemini-cli'].mockRejectedValue(new Error('gemini broke'));
    const res = ok(await readAllSources());
    expect(res.degraded.map(d => d.harness)).toEqual(['codex-cli', 'gemini-cli']);
  });

  it('carries notices through from a harness that counted only part of what it saw', async () => {
    allEmpty();
    counts['claude-code'].mockResolvedValue(result('anthropic', { 'claude-code:a': 1 }, ['provider deepseek not counted']));
    expect(ok(await readAllSources()).notices).toEqual(['provider deepseek not counted']);
  });

  it('a missing home dir is not degraded — an uninstalled tool is normal', async () => {
    allEmpty();
    counts['gemini-cli'].mockRejectedValue(new SourceRootMissing('/home/u/.gemini/tmp'));
    counts['claude-code'].mockResolvedValue(result('anthropic', { 'claude-code:a': 44 }));

    const res = ok(await readAllSources());
    expect(res.degraded).toEqual([]);             // no warning for a tool you don't have
    expect(res.byFamily.google.size).toBe(0);
  });

  it('does not even scan a harness this machine has turned off', async () => {
    allEmpty();
    await setHarnessEnabled('codex-cli', false);
    counts['claude-code'].mockResolvedValue(result('anthropic', { 'claude-code:a': 100 }));

    const res = ok(await readAllSources());
    expect(counts['codex-cli']).not.toHaveBeenCalled();   // skipped, not counted as zero
    expect(counts['claude-code']).toHaveBeenCalled();
    expect(res.degraded).toEqual([]);                     // off is not a failure
    expect(Object.fromEntries(res.byFamily.anthropic)).toEqual({ 'claude-code:a': 100 });
  });

  it('picks up a toggle on the next beat, without a restart', async () => {
    allEmpty();
    counts['codex-cli'].mockResolvedValue(result('openai', { 'codex-cli:r': 10 }));
    expect(ok(await readAllSources()).byFamily.openai.size).toBe(1);

    await setHarnessEnabled('codex-cli', false);
    expect(ok(await readAllSources()).byFamily.openai.size).toBe(0);

    await setHarnessEnabled('codex-cli', true);
    expect(ok(await readAllSources()).byFamily.openai.size).toBe(1);
  });

  it('does not scan a harness that ships disabled until it is asked for', async () => {
    allEmpty();
    await readAllSources();
    expect(counts.pi).not.toHaveBeenCalled();   // Pi is opt-in
    await setHarnessEnabled('pi', true);
    await readAllSources();
    expect(counts.pi).toHaveBeenCalled();
  });

  it('scans nothing, and fails nothing, when every harness is off', async () => {
    allEmpty();
    for (const key of ['claude-code', 'codex-cli', 'gemini-cli'] as const) await setHarnessEnabled(key, false);
    const res = ok(await readAllSources());
    for (const fn of Object.values(counts)) expect(fn).not.toHaveBeenCalled();
    expect(res.degraded).toEqual([]);
    expect(isStall(res)).toBe(false);
  });

  it('never stalls on a harness failure, even when all of them fail', async () => {
    allEmpty();
    for (const fn of Object.values(counts)) fn.mockRejectedValue(new Error('boom'));
    const res = await readAllSources();
    expect(isStall(res)).toBe(false);             // the race keeps running, scoring 0
    expect(ok(res).degraded).toHaveLength(3);
  });
});
