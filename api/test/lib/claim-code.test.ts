import { describe, it, expect } from 'vitest';
import { generateClaimCode } from '../../src/lib/claim-code.js';
import { CLAIM_CODE_LENGTH, normaliseClaimCode, formatClaimCode, JOIN_CODE_ALPHABET } from '@token-derby/shared';

describe('generateClaimCode', () => {
  it('produces 12 characters from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateClaimCode();
      expect(code).toHaveLength(CLAIM_CODE_LENGTH);
      for (const ch of code) expect(JOIN_CODE_ALPHABET).toContain(ch);
    }
  });

  it('does not repeat across many draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateClaimCode());
    expect(seen.size).toBe(500);
  });
});

describe('generated codes survive the shared helpers', () => {
  it('round-trips through format and normalise', () => {
    const code = generateClaimCode();
    expect(normaliseClaimCode(formatClaimCode(code))).toBe(code);
  });
});
