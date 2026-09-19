import { describe, it, expect, vi, afterEach } from 'vitest';
import { SourceRootMissing } from '../../src/tokens/source-root.js';
import { ScanProgress } from '../../src/tokens/scan-progress.js';

const claude = vi.fn();
const codex = vi.fn();
const gemini = vi.fn();

vi.mock('../../src/tokens/counters/index.js', () => ({
  COUNTERS: {
    claude: { key: 'claude', label: 'Claude', byConversation: () => claude() },
    codex: { key: 'codex', label: 'Codex', byConversation: () => codex() },
    gemini: { key: 'gemini', label: 'Gemini', byConversation: () => gemini() },
  },
}));

const { scoreFor, readAllSources, isStall, type: _t } = await import('../../src/tokens/race-tokens.js') as any;
import type { AllSources } from '../../src/tokens/race-tokens.js';

/** Every counter reads empty unless a test says otherwise. */
function allEmpty() {
  claude.mockResolvedValue(new Map());
  codex.mockResolvedValue(new Map());
  gemini.mockResolvedValue(new Map());
}

/** Assert a reading is usable (not a stall) and return it narrowed. */
function ok(r: AllSources | { stall: string }): AllSources {
  if ('stall' in r) throw new Error(`expected a usable reading, got stall: ${r.stall}`);
  return r;
}

afterEach(() => vi.clearAllMocks());

describe('scoreFor', () => {
  it('sums input and output', () => {
    expect(scoreFor({ input: 100, output: 20 })).toBe(120);
  });
});

describe('readAllSources', () => {
  it('reads every model by conversation, scored as input+output', async () => {
    allEmpty();
    claude.mockResolvedValue(new Map([
      ['proj/a', { input: 1, output: 100 }],
      ['proj/b', { input: 2, output: 200 }],
    ]));
    codex.mockResolvedValue(new Map([['rollout-x', { input: 7, output: 50 }]]));
    gemini.mockResolvedValue(new Map([['chat-1', { input: 3, output: 9 }]]));

    const res = ok(await readAllSources());
    expect(Object.fromEntries(res.byConv.claude)).toEqual({ 'proj/a': 101, 'proj/b': 202 });
    expect(Object.fromEntries(res.byConv.codex)).toEqual({ 'rollout-x': 57 });
    expect(Object.fromEntries(res.byConv.gemini)).toEqual({ 'chat-1': 12 });
    expect(res.degraded).toEqual([]);
  });

  it('scans every source concurrently — a beat costs the slowest, not the sum', async () => {
    allEmpty();
    let release!: (m: Map<string, { input: number; output: number }>) => void;
    claude.mockReturnValue(new Promise((r) => { release = r; }));
    codex.mockResolvedValue(new Map([['r', { input: 0, output: 50 }]]));

    const pending = readAllSources();
    await Promise.resolve();
    expect(codex).toHaveBeenCalled();
    expect(gemini).toHaveBeenCalled();

    release(new Map([['proj/a', { input: 0, output: 100 }]]));
    const res = ok(await pending);
    expect(Object.fromEntries(res.byConv.codex)).toEqual({ r: 50 });
    expect(Object.fromEntries(res.byConv.claude)).toEqual({ 'proj/a': 100 });
  });

  it('records which sources are still scanning when a beat runs long', async () => {
    allEmpty();
    claude.mockReturnValue(new Promise(() => {})); // never settles
    const progress = new ScanProgress();
    void readAllSources(progress);
    await vi.waitFor(() => expect(progress.outstanding()).toEqual(['claude']));
  });

  it('skips a source it cannot read, and still counts the others', async () => {
    allEmpty();
    codex.mockRejectedValue(new Error('EACCES: permission denied'));
    claude.mockResolvedValue(new Map([['proj/a', { input: 0, output: 100 }]]));
    gemini.mockResolvedValue(new Map([['chat-1', { input: 0, output: 9 }]]));

    const res = ok(await readAllSources());       // not a stall — the race continues
    expect(res.degraded).toEqual([{ key: 'codex', message: 'EACCES: permission denied' }]);
    expect(res.byConv.codex.size).toBe(0);        // skipped, not partially counted
    expect(Object.fromEntries(res.byConv.claude)).toEqual({ 'proj/a': 100 });
    expect(Object.fromEntries(res.byConv.gemini)).toEqual({ 'chat-1': 9 });
  });

  it('degrades every failing source, in a stable order', async () => {
    allEmpty();
    codex.mockRejectedValue(new Error('codex broke'));
    gemini.mockRejectedValue(new Error('gemini broke'));
    const res = ok(await readAllSources());
    expect(res.degraded.map(d => d.key)).toEqual(['codex', 'gemini']); // MODEL_KEYS order
  });

  it('a missing home dir is not degraded — an uninstalled tool is normal', async () => {
    allEmpty();
    gemini.mockRejectedValue(new SourceRootMissing('/home/u/.gemini/tmp'));
    claude.mockResolvedValue(new Map([['proj/a', { input: 4, output: 40 }]]));

    const res = ok(await readAllSources());
    expect(res.degraded).toEqual([]);             // no warning for a tool you don't have
    expect(res.byConv.gemini.size).toBe(0);
    expect(Object.fromEntries(res.byConv.claude)).toEqual({ 'proj/a': 44 });
  });

  it('never stalls on a source failure, even when all three fail', async () => {
    allEmpty();
    claude.mockRejectedValue(new Error('a'));
    codex.mockRejectedValue(new Error('b'));
    gemini.mockRejectedValue(new Error('c'));
    const res = await readAllSources();
    expect(isStall(res)).toBe(false);             // the race keeps running, scoring 0
    expect(ok(res).degraded).toHaveLength(3);
  });
});
