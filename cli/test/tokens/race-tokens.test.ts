import { describe, it, expect, vi, afterEach } from 'vitest';
import { scoreFor, readAllSources } from '../../src/tokens/race-tokens.js';

vi.mock('../../src/tokens/transcripts.js', async (orig) => ({
  ...(await orig<typeof import('../../src/tokens/transcripts.js')>()),
  sumTokens: vi.fn(),
}));
vi.mock('../../src/tokens/codex.js', () => ({ sumCodexTokens: vi.fn() }));
vi.mock('../../src/tokens/gemini.js', () => ({ sumGeminiTokens: vi.fn() }));

import { sumTokens } from '../../src/tokens/transcripts.js';
import { sumCodexTokens } from '../../src/tokens/codex.js';
import { sumGeminiTokens } from '../../src/tokens/gemini.js';

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
  it('returns each source scored in the race mode', async () => {
    vi.mocked(sumTokens).mockResolvedValue({ input: 5, output: 100 });
    vi.mocked(sumCodexTokens).mockResolvedValue({ input: 7, output: 200 });
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 3, output: 50 });
    expect(await readAllSources({}, 'claude')).toEqual({ claude: 100, codex: 200, gemini: 50 });
  });

  it('a secondary source failure contributes 0, not a stall', async () => {
    vi.mocked(sumTokens).mockResolvedValue({ input: 0, output: 100 });
    vi.mocked(sumCodexTokens).mockRejectedValue(new Error('boom'));
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 50 });
    expect(await readAllSources({}, 'claude')).toEqual({ claude: 100, codex: 0, gemini: 50 });
  });

  it('a PRIMARY source failure stalls the beat (null)', async () => {
    vi.mocked(sumTokens).mockResolvedValue({ input: 0, output: 100 });
    vi.mocked(sumCodexTokens).mockRejectedValue(new Error('boom'));
    vi.mocked(sumGeminiTokens).mockResolvedValue({ input: 0, output: 50 });
    expect(await readAllSources({}, 'codex')).toBeNull();
  });
});
