import { describe, it, expect } from 'vitest';
import {
  CLAIM_CODE_LENGTH,
  normaliseClaimCode,
  formatClaimCode,
} from '../src/claim-code.js';

describe('normaliseClaimCode', () => {
  it('accepts the canonical form', () => {
    expect(normaliseClaimCode('ABCDEFGHJKLM')).toBe('ABCDEFGHJKLM');
  });

  it('strips dashes and whitespace and uppercases', () => {
    expect(normaliseClaimCode('abcd-efgh-jklm')).toBe('ABCDEFGHJKLM');
    expect(normaliseClaimCode('  ABCD EFGH JKLM  ')).toBe('ABCDEFGHJKLM');
    expect(normaliseClaimCode('ABCD-efgh JKLM')).toBe('ABCDEFGHJKLM');
  });

  it('rejects wrong lengths', () => {
    expect(normaliseClaimCode('ABCDEFGHJKL')).toBeNull();
    expect(normaliseClaimCode('ABCDEFGHJKLMN')).toBeNull();
    expect(normaliseClaimCode('')).toBeNull();
  });

  it('rejects characters outside the alphabet', () => {
    // I, O, 0 and 1 are deliberately absent from JOIN_CODE_ALPHABET.
    expect(normaliseClaimCode('ABCDEFGHJKL0')).toBeNull();
    expect(normaliseClaimCode('ABCDEFGHJKLI')).toBeNull();
    expect(normaliseClaimCode('ABCDEFGHJKL!')).toBeNull();
  });
});

describe('formatClaimCode', () => {
  it('groups into three blocks of four', () => {
    expect(formatClaimCode('ABCDEFGHJKLM')).toBe('ABCD-EFGH-JKLM');
  });

  it('round-trips through normalise', () => {
    expect(normaliseClaimCode(formatClaimCode('ABCDEFGHJKLM'))).toBe('ABCDEFGHJKLM');
  });

  it('agrees with the declared length', () => {
    expect(CLAIM_CODE_LENGTH).toBe(12);
  });
});
