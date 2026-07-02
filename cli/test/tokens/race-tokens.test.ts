import { describe, it, expect, vi, afterEach } from 'vitest';
import { scoreFor, readAllSources, type AllSources } from '../../src/tokens/race-tokens.js';

vi.mock('../../src/tokens/transcripts.js', async (orig) => ({
  ...(await orig<typeof import('../../src/tokens/transcripts.js')>()),
  sumTokens: vi.fn(),
  sumTokensByConversation: vi.fn(),
}));
vi.mock('../../src/tokens/codex.js', () => ({ sumCodexTokens: vi.fn(), sumCodexByConversation: vi.fn() }));
vi.mock('../../src/tokens/gemini.js', () => ({ sumGeminiTokens: vi.fn(), sumGeminiByConversation: vi.fn() }));

import { sumTokens, sumTokensByConversation } from '../../src/tokens/transcripts.js';
import { sumCodexTokens, sumCodexByConversation } from '../../src/tokens/codex.js';
import { sumGeminiTokens, sumGeminiByConversation } from '../../src/tokens/gemini.js';

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
