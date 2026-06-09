import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { scrapeVllmCounters, sampleModalTokens, __resetModalState } from '../../src/tokens/modal.js';

// prompt, cached, generation counters
const METRICS = (prompt: number, cached: number, gen: number) => `# TYPE vllm:prompt_tokens_total counter
vllm:prompt_tokens_total{engine="0",model_name="qwen"} ${prompt}
vllm:prompt_tokens_cached_total{engine="0",model_name="qwen"} ${cached}
vllm:generation_tokens_total{engine="0",model_name="qwen"} ${gen}
`;

function fetchReturning(getText: () => string | null) {
  return vi.fn().mockImplementation(() => {
    const text = getText();
    if (text === null) return Promise.reject(new Error('ECONNREFUSED'));
    return Promise.resolve({ ok: true, text: () => Promise.resolve(text) });
  });
}

beforeEach(() => {
  __resetModalState();
  process.env.TOKEN_DERBY_VLLM_URLS = 'qwen=https://example.test';
});
afterEach(() => {
  delete process.env.TOKEN_DERBY_VLLM_URLS;
  vi.restoreAllMocks();
});

describe('scrapeVllmCounters', () => {
  it('parses prompt, cached, and generation counters', async () => {
    vi.stubGlobal('fetch', fetchReturning(() => METRICS(100, 30, 40)));
    expect(await scrapeVllmCounters('https://example.test')).toEqual({ prompt: 100, cached: 30, gen: 40 });
  });

  it('returns null when unreachable', async () => {
    vi.stubGlobal('fetch', fetchReturning(() => null));
    expect(await scrapeVllmCounters('https://example.test')).toBeNull();
  });

  it('returns null when no token metrics are present', async () => {
    vi.stubGlobal('fetch', fetchReturning(() => '# nothing here\n'));
    expect(await scrapeVllmCounters('https://example.test')).toBeNull();
  });

  it('appends /metrics, trimming trailing slashes', async () => {
    const f = fetchReturning(() => METRICS(1, 0, 1));
    vi.stubGlobal('fetch', f);
    await scrapeVllmCounters('https://example.test///');
    expect(f).toHaveBeenCalledWith('https://example.test/metrics', expect.anything());
  });
});

describe('sampleModalTokens accumulator', () => {
  it('treats the first reading as a baseline (counts nothing yet)', async () => {
    vi.stubGlobal('fetch', fetchReturning(() => METRICS(500, 100, 500)));
    expect(await sampleModalTokens()).toEqual({ input: 0, output: 0 });
  });

  it('counts deltas as fresh input (prompt - cached) and output (generation)', async () => {
    let text = METRICS(100, 20, 100);
    vi.stubGlobal('fetch', fetchReturning(() => text));
    expect(await sampleModalTokens()).toEqual({ input: 0, output: 0 }); // baseline
    text = METRICS(300, 70, 250); // Δprompt=200 Δcached=50 Δgen=150 → input=150 out=150
    expect(await sampleModalTokens()).toEqual({ input: 150, output: 150 });
  });

  it('handles a cold-start counter reset without going backwards', async () => {
    let text = METRICS(400, 0, 400);
    vi.stubGlobal('fetch', fetchReturning(() => text));
    await sampleModalTokens(); // baseline
    text = METRICS(500, 0, 500); // +100 / +100
    expect(await sampleModalTokens()).toEqual({ input: 100, output: 100 });
    text = METRICS(30, 0, 20); // reset: add post-reset values
    expect(await sampleModalTokens()).toEqual({ input: 130, output: 120 });
  });

  it('holds the total while a source is asleep, resumes after', async () => {
    let payload: string | null = METRICS(100, 0, 100);
    vi.stubGlobal('fetch', fetchReturning(() => payload));
    await sampleModalTokens(); // baseline
    payload = METRICS(200, 0, 200);
    expect(await sampleModalTokens()).toEqual({ input: 100, output: 100 });
    payload = null; // asleep
    expect(await sampleModalTokens()).toEqual({ input: 100, output: 100 });
    payload = METRICS(250, 0, 250);
    expect(await sampleModalTokens()).toEqual({ input: 150, output: 150 });
  });

  it('returns zero when no sources are configured', async () => {
    delete process.env.TOKEN_DERBY_VLLM_URLS;
    vi.stubGlobal('fetch', fetchReturning(() => METRICS(1, 0, 1)));
    expect(await sampleModalTokens()).toEqual({ input: 0, output: 0 });
  });
});
