import { describe, it, expect, vi, afterEach } from 'vitest';
import { scoreFor, readAllSources, type AllSources } from '../../src/tokens/race-tokens.js';
import { SourceRootMissing } from '../../src/tokens/source-root.js';
import { ScanProgress } from '../../src/tokens/scan-progress.js';

vi.mock('../../src/tokens/transcripts.js', async (orig) => ({
  ...(await orig<typeof import('../../src/tokens/transcripts.js')>()),
  sumTokensByConversation: vi.fn(),
}));
vi.mock('../../src/tokens/codex.js', () => ({ sumCodexByConversation: vi.fn() }));
vi.mock('../../src/tokens/gemini.js', () => ({ sumGeminiByConversation: vi.fn() }));

import { sumTokensByConversation } from '../../src/tokens/transcripts.js';
import { sumCodexByConversation } from '../../src/tokens/codex.js';
import { sumGeminiByConversation } from '../../src/tokens/gemini.js';

/** Every mocked reader resolves empty unless a test says otherwise. */
function allEmpty() {
  vi.mocked(sumTokensByConversation).mockResolvedValue(new Map());
  vi.mocked(sumCodexByConversation).mockResolvedValue(new Map());
  vi.mocked(sumGeminiByConversation).mockResolvedValue(new Map());
}

afterEach(() => vi.clearAllMocks());

/** Assert a reading is usable (not a stall) and return it narrowed. */
function ok(r: AllSources | { stall: string }): AllSources {
  if ('stall' in r) throw new Error(`expected a usable reading, got stall: ${r.stall}`);
  return r;
}

describe('scoreFor', () => {
  it('sums input and output', () => {
    expect(scoreFor({ input: 100, output: 20 })).toBe(120);
  });
});

describe('readAllSources', () => {
  it('reads every model by conversation, scored as input+output', async () => {
    allEmpty();
    vi.mocked(sumTokensByConversation).mockResolvedValue(new Map([
      ['proj/a', { input: 1, output: 100 }],
      ['proj/b', { input: 2, output: 200 }],
    ]));
    vi.mocked(sumCodexByConversation).mockResolvedValue(new Map([['rollout-x', { input: 7, output: 50 }]]));
    vi.mocked(sumGeminiByConversation).mockResolvedValue(new Map([['chat-1', { input: 3, output: 9 }]]));

    const res = ok(await readAllSources());
    expect(Object.fromEntries(res.byConv.claude)).toEqual({ 'proj/a': 101, 'proj/b': 202 });
    expect(Object.fromEntries(res.byConv.codex)).toEqual({ 'rollout-x': 57 });
    expect(Object.fromEntries(res.byConv.gemini)).toEqual({ 'chat-1': 12 });
  });

  it('scans every source concurrently — a beat costs the slowest, not the sum', async () => {
    allEmpty();
    let releaseClaude!: (m: Map<string, { input: number; output: number }>) => void;
    vi.mocked(sumTokensByConversation).mockReturnValue(new Promise((r) => { releaseClaude = r; }));
    vi.mocked(sumCodexByConversation).mockResolvedValue(new Map([['r', { input: 0, output: 50 }]]));

    const pending = readAllSources();
    await Promise.resolve();
    expect(sumCodexByConversation).toHaveBeenCalled();
    expect(sumGeminiByConversation).toHaveBeenCalled();

    releaseClaude(new Map([['proj/a', { input: 0, output: 100 }]]));
    const res = ok(await pending);
    expect(Object.fromEntries(res.byConv.codex)).toEqual({ r: 50 });
    expect(Object.fromEntries(res.byConv.claude)).toEqual({ 'proj/a': 100 });
  });

  it('records which sources are still scanning when a beat runs long', async () => {
    allEmpty();
    vi.mocked(sumTokensByConversation).mockReturnValue(new Promise(() => {})); // never settles
    const progress = new ScanProgress();
    void readAllSources(progress);
    await vi.waitFor(() => expect(progress.outstanding()).toEqual(['claude']));
  });

  it('a genuine read error on ANY source stalls the beat and reports the cause', async () => {
    allEmpty();
    vi.mocked(sumCodexByConversation).mockRejectedValue(new Error('disk exploded'));
    const res = await readAllSources();
    expect(res).toHaveProperty('stall');
    const reason = (res as { stall: string }).stall;
    expect(reason).toContain('codex');          // names the source that failed…
    expect(reason).toContain('disk exploded');  // …and the underlying cause
  });

  it('a missing home dir reads as empty — an uninstalled tool never freezes a race', async () => {
    allEmpty();
    vi.mocked(sumGeminiByConversation).mockRejectedValue(new SourceRootMissing('/home/u/.gemini/tmp'));
    vi.mocked(sumTokensByConversation).mockResolvedValue(new Map([['proj/a', { input: 4, output: 40 }]]));
    vi.mocked(sumCodexByConversation).mockResolvedValue(new Map([['r', { input: 7, output: 70 }]]));

    const res = await readAllSources();
    expect(res).not.toHaveProperty('stall');
    const usable = res as AllSources;
    expect(usable.byConv.gemini.size).toBe(0);
    expect(Object.fromEntries(usable.byConv.claude)).toEqual({ 'proj/a': 44 });
    expect(Object.fromEntries(usable.byConv.codex)).toEqual({ r: 77 });
  });

  it('names sources in a stable order when more than one fails', async () => {
    allEmpty();
    vi.mocked(sumCodexByConversation).mockRejectedValue(new Error('codex broke'));
    vi.mocked(sumGeminiByConversation).mockRejectedValue(new Error('gemini broke'));
    const res = await readAllSources();
    expect((res as { stall: string }).stall).toContain('codex');  // MODEL_KEYS order
  });
});
