import { describe, it, expect } from 'vitest';
import { MODEL_KEYS, SECONDARY_WEIGHT, isModelKey, weightFor, weightedTotal } from '../src/models.js';

describe('models', () => {
  it('lists exactly the three model keys', () => {
    expect(MODEL_KEYS).toEqual(['claude', 'codex', 'gemini']);
    expect(SECONDARY_WEIGHT).toBe(0.1);
  });

  it('isModelKey validates the enum', () => {
    expect(isModelKey('codex')).toBe(true);
    expect(isModelKey('gpt')).toBe(false);
    expect(isModelKey(undefined)).toBe(false);
  });

  it('weightFor is 1 for the primary and 0.1 for others', () => {
    expect(weightFor('codex', 'codex')).toBe(1);
    expect(weightFor('codex', 'claude')).toBe(0.1);
  });

  it('weightedTotal sums primary at full weight and others at 10%', () => {
    // primary codex: 310000*1 + 1240000*0.1 + 52000*0.1 = 310000 + 124000 + 5200 = 439200
    expect(weightedTotal('codex', { claude: 1_240_000, codex: 310_000, gemini: 52_000 })).toBe(439_200);
  });
});
