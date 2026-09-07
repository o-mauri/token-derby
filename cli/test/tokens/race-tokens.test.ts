import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { piModelKey } from '@token-derby/shared';
import { scoreFor, readAllSources, type AllSources } from '../../src/tokens/race-tokens.js';
import { ScanProgress } from '../../src/tokens/scan-progress.js';
import { buildInitialState } from '../../src/runtime/run-race.js';

vi.mock('../../src/tokens/transcripts.js', async (orig) => ({
  ...(await orig<typeof import('../../src/tokens/transcripts.js')>()),
  sumTokens: vi.fn(),
  sumTokensByConversation: vi.fn(),
}));
vi.mock('../../src/tokens/codex.js', () => ({ sumCodexTokens: vi.fn(), sumCodexByConversation: vi.fn() }));
vi.mock('../../src/tokens/gemini.js', () => ({ sumGeminiTokens: vi.fn(), sumGeminiByConversation: vi.fn() }));
vi.mock('../../src/tokens/pi.js', () => ({ sumPiByModelAndConversation: vi.fn() }));

import { sumTokens, sumTokensByConversation } from '../../src/tokens/transcripts.js';
import { sumCodexTokens, sumCodexByConversation } from '../../src/tokens/codex.js';
import { sumGeminiTokens, sumGeminiByConversation } from '../../src/tokens/gemini.js';
import { sumPiByModelAndConversation } from '../../src/tokens/pi.js';

beforeEach(() => {
  vi.mocked(sumPiByModelAndConversation).mockResolvedValue(new Map());
});
afterEach(() => vi.clearAllMocks());

/** Assert a reading is usable (not a stall) and return it narrowed. */
function ok(r: AllSources | { stall: string }): AllSources {
  if ('stall' in r) throw new Error(`expected a usable reading, got stall: ${r.stall}`);
  return r;
}

describe('scoreFor', () => {
  it('output-only when the race does not count input', () => {
    expect(scoreFor({}, { input: 100, output: 20 })).toBe(20);
  });
  it('input+output when the race counts input', () => {
    expect(scoreFor({ counts_input: true }, { input: 100, output: 20 })).toBe(120);
  });
});

describe('readAllSources', () => {
  it('reads the primary by-conversation (scored) and secondaries scalar (scored)', async () => {
    vi.mocked(sumTokensByConversation).mockResolvedValue(new Map([
      ['proj/a', { input: 1, output: 100 }],
      ['proj/b', { input: 2, output: 200 }],
    ]));
    vi.mocked(sumCodexTokens).mockResolvedValue({ input: 7, output: 50 });
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 3, output: 9 });
    const res = ok(await readAllSources({}, 'claude'));
    expect(res.secondary.codex).toBe(50);
    expect(res.secondary.gemini).toBe(9);
    expect(Object.fromEntries(res.primaryByConv)).toEqual({ 'proj/a': 100, 'proj/b': 200 });
  });

  it('scores the primary conversations in input+output mode', async () => {
    vi.mocked(sumCodexByConversation).mockResolvedValue(new Map([['rollout-x', { input: 5, output: 50 }]]));
    vi.mocked(sumTokens).mockResolvedValue({ input: 0, output: 0 });
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 0 });
    const res = ok(await readAllSources({ counts_input: true }, 'codex'));
    expect(Object.fromEntries(res.primaryByConv)).toEqual({ 'rollout-x': 55 });
  });

  it('uses an exact Pi provider/model as primary and keeps every other bucket secondary', async () => {
    const qwen = piModelKey('qwen', 'qwen3-coder')!;
    const openai = piModelKey('openai-codex', 'gpt-5.3-codex')!;
    vi.mocked(sumPiByModelAndConversation).mockResolvedValue(new Map([
      [qwen, new Map([['pi/project/session', { input: 5, output: 50 }]])],
      [openai, new Map([['pi/project/other', { input: 2, output: 20 }]])],
    ]));
    vi.mocked(sumTokens).mockResolvedValue({ input: 1, output: 10 });
    vi.mocked(sumCodexTokens).mockResolvedValue({ input: 2, output: 20 });
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 3, output: 30 });

    const res = ok(await readAllSources({}, qwen));
    expect(Object.fromEntries(res.primaryByConv)).toEqual({ 'pi/project/session': 50 });
    expect(res.secondary).toMatchObject({ claude: 10, codex: 20, gemini: 30, [openai]: 20 });
  });

  it('stalls on a real Pi read error only when a Pi model is primary', async () => {
    const qwen = piModelKey('qwen', 'qwen3-coder')!;
    vi.mocked(sumPiByModelAndConversation).mockRejectedValue(new Error('pi disk exploded'));
    vi.mocked(sumTokens).mockResolvedValue({ input: 0, output: 10 });
    vi.mocked(sumTokensByConversation).mockResolvedValue(new Map([['claude/a', { input: 0, output: 10 }]]));
    vi.mocked(sumCodexTokens).mockResolvedValue({ input: 0, output: 20 });
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 30 });

    await expect(readAllSources({}, qwen)).resolves.toEqual({
      stall: expect.stringContaining('pi disk exploded'),
    });
    const secondary = ok(await readAllSources({}, 'claude'));
    expect(secondary.piAvailable).toBe(false);

    // Initialization must preserve the failed-baseline signal even for a Pi
    // primary, so the score tracker can prime history on recovery.
    const baseline = ok(await readAllSources({}, qwen, undefined, { baseline: true }));
    expect(baseline.piAvailable).toBe(false);
    const initialized = await buildInitialState({
      active: { primary_model: qwen } as any,
      raceStatus: 'live',
      serverLastSeq: 4,
    });
    expect(initialized.initialState.piPrimed).toBe(false);
  });

  it('starts the secondary scans without waiting for the primary to finish', async () => {
    // The beat should cost the SLOWEST source, not the sum of all of them.
    let releasePrimary!: (m: Map<string, { input: number; output: number }>) => void;
    vi.mocked(sumTokensByConversation).mockReturnValue(new Promise((r) => { releasePrimary = r; }));
    vi.mocked(sumCodexTokens).mockResolvedValue({ input: 0, output: 50 });
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 9 });

    const pending = readAllSources({}, 'claude');
    await Promise.resolve(); // flush scheduling; primary is still in flight
    expect(sumCodexTokens).toHaveBeenCalled();
    expect(sumGeminiTokens).toHaveBeenCalled();

    releasePrimary(new Map([['proj/a', { input: 0, output: 100 }]]));
    const res = ok(await pending);
    expect(res.secondary.codex).toBe(50);
    expect(Object.fromEntries(res.primaryByConv)).toEqual({ 'proj/a': 100 });
  });

  it('records which sources are still scanning when a beat runs long', async () => {
    vi.mocked(sumTokensByConversation).mockReturnValue(new Promise(() => {})); // never settles
    vi.mocked(sumCodexTokens).mockResolvedValue({ input: 0, output: 50 });
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 9 });

    const progress = new ScanProgress();
    void readAllSources({}, 'claude', progress);
    await vi.waitFor(() => expect(progress.outstanding()).toEqual(['claude']));
  });

  it('a secondary source failure contributes 0, not a stall', async () => {
    vi.mocked(sumTokensByConversation).mockResolvedValue(new Map([['proj/a', { input: 0, output: 100 }]]));
    vi.mocked(sumCodexTokens).mockRejectedValue(new Error('boom'));
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 9 });
    const res = ok(await readAllSources({}, 'claude'));
    expect(res.secondary.codex).toBe(0);
    expect(res.secondary.gemini).toBe(9);
  });

  it('a genuine PRIMARY read error stalls the beat and reports the cause', async () => {
    vi.mocked(sumCodexByConversation).mockRejectedValue(new Error('disk exploded'));
    vi.mocked(sumTokens).mockResolvedValue({ input: 0, output: 0 });
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 0 });
    const res = await readAllSources({}, 'codex');
    expect(res).toHaveProperty('stall');
    const reason = (res as { stall: string }).stall;
    expect(reason).toContain('codex');       // names the source that failed…
    expect(reason).toContain('disk exploded'); // …and the underlying cause
  });

  it('treats an empty Pi history as a successful zero baseline', async () => {
    const qwen = piModelKey('qwen', 'qwen3-coder')!;
    vi.mocked(sumPiByModelAndConversation).mockResolvedValue(new Map());
    vi.mocked(sumTokens).mockResolvedValue({ input: 0, output: 0 });
    vi.mocked(sumCodexTokens).mockResolvedValue({ input: 0, output: 0 });
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 0 });

    const res = ok(await readAllSources({}, qwen, undefined, { baseline: true }));
    expect(res.piAvailable).toBe(true);
    expect(res.primaryByConv.size).toBe(0);
  });

  it('a PRIMARY with a missing home dir (ENOENT) reads as empty — never a stall', async () => {
    // The user's real bug: primary = a CLI they've never run, so its home dir is
    // absent. That must count as "0 tokens", not freeze the whole race.
    vi.mocked(sumGeminiByConversation).mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' }),
    );
    vi.mocked(sumTokens).mockResolvedValue({ input: 4, output: 40 });
    vi.mocked(sumCodexTokens).mockResolvedValue({ input: 7, output: 70 });
    const res = await readAllSources({}, 'gemini');
    expect(res).not.toHaveProperty('stall');
    const ok = res as AllSources;
    expect(ok.primaryByConv.size).toBe(0); // gemini has no data → empty
    expect(ok.secondary.claude).toBe(40);  // secondaries keep counting normally
    expect(ok.secondary.codex).toBe(70);
  });
});
