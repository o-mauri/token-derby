import { describe, it, expect } from 'vitest';
import {
  MODEL_KEYS,
  SECONDARY_WEIGHT,
  isModelKey,
  modelLabel,
  piModelKey,
  piModelParts,
  weightFor,
  weightedTotal,
} from '../src/models.js';

describe('models', () => {
  it('keeps the three built-in CLI model keys', () => {
    expect(MODEL_KEYS).toEqual(['claude', 'codex', 'gemini']);
    expect(SECONDARY_WEIGHT).toBe(0.5);
  });

  it('builds and parses canonical Pi provider/model keys', () => {
    const key = piModelKey('openrouter', 'anthropic/claude-4.1');
    expect(key).toBe('pi:openrouter/anthropic%2Fclaude-4.1');
    expect(piModelParts(key)).toEqual({ provider: 'openrouter', model: 'anthropic/claude-4.1' });
    expect(modelLabel(key!)).toBe('openrouter/anthropic/claude-4.1 (Pi)');
  });

  it('rejects empty, malformed, non-canonical, and oversized Pi keys', () => {
    expect(piModelKey('', 'model')).toBeNull();
    expect(piModelKey('provider', '')).toBeNull();
    expect(isModelKey('pi:qwen/')).toBe(false);
    expect(isModelKey('pi:qwen/model/extra')).toBe(false);
    expect(isModelKey('pi:qwen/a%2fb')).toBe(false); // lower-case escape is not canonical
    expect(piModelKey('p', 'x'.repeat(600))).toBeNull();
  });

  it('isModelKey accepts built-ins and canonical Pi keys only', () => {
    expect(isModelKey('codex')).toBe(true);
    expect(isModelKey('pi:qwen/qwen3-coder')).toBe(true);
    expect(isModelKey('gpt')).toBe(false);
    expect(isModelKey(undefined)).toBe(false);
  });

  it('weightFor is 1 for the primary and 0.5 for others', () => {
    const qwen = piModelKey('qwen', 'qwen3-coder')!;
    expect(weightFor(qwen, qwen)).toBe(1);
    expect(weightFor(qwen, 'claude')).toBe(0.5);
  });

  it('weightedTotal includes dynamically discovered Pi buckets', () => {
    const qwen = piModelKey('qwen', 'qwen3-coder')!;
    expect(weightedTotal(qwen, {
      claude: 1_240_000,
      codex: 310_000,
      gemini: 52_000,
      [qwen]: 100_000,
      invalid: 999_999,
    } as any)).toBe(901_000); // qwen 100k + the three built-ins at 50%; invalid ignored
  });
});
