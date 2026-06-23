import { describe, it, expect, vi, afterEach } from 'vitest';
import { scoreFor, readAllSources } from '../../src/tokens/race-tokens.js';

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
    const res = await readAllSources({}, 'claude');
    expect(res!.secondary.codex).toBe(50);
    expect(res!.secondary.gemini).toBe(9);
    expect(Object.fromEntries(res!.primaryByConv)).toEqual({ 'proj/a': 100, 'proj/b': 200 });
  });

  it('scores the primary conversations in input+output mode', async () => {
    vi.mocked(sumCodexByConversation).mockResolvedValue(new Map([['rollout-x', { input: 5, output: 50 }]]));
    vi.mocked(sumTokens).mockResolvedValue({ input: 0, output: 0 });
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 0 });
    const res = await readAllSources({ counts_input: true }, 'codex');
    expect(Object.fromEntries(res!.primaryByConv)).toEqual({ 'rollout-x': 55 });
  });

  it('a secondary source failure contributes 0, not a stall', async () => {
    vi.mocked(sumTokensByConversation).mockResolvedValue(new Map([['proj/a', { input: 0, output: 100 }]]));
    vi.mocked(sumCodexTokens).mockRejectedValue(new Error('boom'));
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 9 });
    const res = await readAllSources({}, 'claude');
    expect(res!.secondary.codex).toBe(0);
    expect(res!.secondary.gemini).toBe(9);
  });

  it('a PRIMARY source failure stalls the beat (null)', async () => {
    vi.mocked(sumCodexByConversation).mockRejectedValue(new Error('missing root'));
    vi.mocked(sumTokens).mockResolvedValue({ input: 0, output: 0 });
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 0 });
    expect(await readAllSources({}, 'codex')).toBeNull();
  });
});
