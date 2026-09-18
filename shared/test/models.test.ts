import { describe, it, expect } from 'vitest';
import { MODEL_KEYS, isModelKey, totalFor } from '../src/models.js';

describe('models', () => {
  it('lists exactly the three model keys', () => {
    expect(MODEL_KEYS).toEqual(['claude', 'codex', 'gemini']);
  });

  it('isModelKey validates the enum', () => {
    expect(isModelKey('codex')).toBe(true);
    expect(isModelKey('gpt')).toBe(false);
    expect(isModelKey(undefined)).toBe(false);
  });

  it('totalFor sums every model at equal weight', () => {
    expect(totalFor({ claude: 1_240_000, codex: 310_000, gemini: 52_000 })).toBe(1_602_000);
  });

  it('totalFor is zero for an empty board', () => {
    expect(totalFor({ claude: 0, codex: 0, gemini: 0 })).toBe(0);
  });
});
