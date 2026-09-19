import { describe, it, expect } from 'vitest';
import { MODEL_FAMILIES, isModelFamily, familyForKey, totalFor, zeroPerFamily } from '../src/models.js';

describe('model families', () => {
  it('lists exactly the three families we score', () => {
    expect(MODEL_FAMILIES).toEqual(['anthropic', 'openai', 'google']);
  });

  it('isModelFamily validates the enum', () => {
    expect(isModelFamily('openai')).toBe(true);
    expect(isModelFamily('deepseek')).toBe(false);
    expect(isModelFamily(undefined)).toBe(false);
  });

  it('totalFor sums every family at equal weight', () => {
    expect(totalFor({ anthropic: 1_240_000, openai: 310_000, google: 52_000 })).toBe(1_602_000);
  });

  it('zeroPerFamily starts every family at nothing', () => {
    expect(zeroPerFamily()).toEqual({ anthropic: 0, openai: 0, google: 0 });
  });
});

describe('familyForKey', () => {
  it('accepts a current family key unchanged', () => {
    expect(familyForKey('anthropic')).toBe('anthropic');
  });

  it('translates the keys older CLIs send, which named the tool not the vendor', () => {
    expect(familyForKey('claude')).toBe('anthropic');
    expect(familyForKey('codex')).toBe('openai');
    expect(familyForKey('gemini')).toBe('google');
  });

  it('rejects anything else rather than guessing', () => {
    expect(familyForKey('deepseek')).toBeNull();
    expect(familyForKey('')).toBeNull();
  });
});
