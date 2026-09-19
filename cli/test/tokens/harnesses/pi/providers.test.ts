import { describe, it, expect } from 'vitest';
import { resolveProvider, describeUncounted } from '../../../../src/tokens/harnesses/pi/providers.js';

describe('resolveProvider', () => {
  it('maps the providers that serve exactly one vendor', () => {
    expect(resolveProvider('anthropic')).toEqual({ kind: 'family', family: 'anthropic' });
    expect(resolveProvider('openai')).toEqual({ kind: 'family', family: 'openai' });
    expect(resolveProvider('google')).toEqual({ kind: 'family', family: 'google' });
  });

  it('maps Azure to OpenAI, which it serves by definition', () => {
    // Its model ids are arbitrary deployment names, so the provider is the only
    // thing that can settle it — and it is enough.
    expect(resolveProvider('azure-openai-responses')).toEqual({ kind: 'family', family: 'openai' });
  });

  it('reports a gateway as uncounted rather than guessing its vendor', () => {
    for (const p of ['amazon-bedrock', 'openrouter', 'cloudflare-ai-gateway']) {
      expect(resolveProvider(p)).toEqual({ kind: 'gateway', provider: p });
    }
  });

  it('reports a provider serving none of our families as other', () => {
    for (const p of ['deepseek', 'xai', 'groq', 'mistral', 'ollama']) {
      expect(resolveProvider(p)).toEqual({ kind: 'other', provider: p });
    }
  });

  it('never sniffs the model id — a local model named like GPT is not OpenAI', () => {
    // Confining the guessing to provider ids is what stops `gpt-oss` on Ollama
    // being counted as OpenAI work.
    expect(resolveProvider('ollama').kind).toBe('other');
  });

  it('normalises case and surrounding space', () => {
    expect(resolveProvider('  Anthropic  ')).toEqual({ kind: 'family', family: 'anthropic' });
  });
});

describe('describeUncounted', () => {
  it('says nothing when everything counted', () => {
    expect(describeUncounted([])).toEqual([]);
  });

  it('separates a gateway we cannot yet read from a vendor we do not score', () => {
    const lines = describeUncounted([
      { kind: 'gateway', provider: 'amazon-bedrock' },
      { kind: 'other', provider: 'deepseek' },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.find(l => l.includes('amazon-bedrock'))).toMatch(/not yet identifiable/);
    expect(lines.find(l => l.includes('deepseek'))).toMatch(/not one of the model families/);
  });

  it('reports each provider once however many times it appeared', () => {
    const lines = describeUncounted([
      { kind: 'other', provider: 'deepseek' },
      { kind: 'other', provider: 'deepseek' },
      { kind: 'other', provider: 'xai' },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('deepseek, xai');
  });
});
