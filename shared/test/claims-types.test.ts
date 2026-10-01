import { describe, it, expect } from 'vitest';
import { MAX_PACK_ENTRIES, MAX_CLAIM_REDEMPTIONS } from '../src/claims.js';
import { ERROR_STATUS } from '../src/errors.js';

describe('claim pack constants', () => {
  it('caps pack size and redemption count', () => {
    expect(MAX_PACK_ENTRIES).toBe(20);
    expect(MAX_CLAIM_REDEMPTIONS).toBe(500);
  });
});

describe('CLAIM_EXHAUSTED', () => {
  it('is a conflict, like the already-redeemed case', () => {
    expect(ERROR_STATUS.CLAIM_EXHAUSTED).toBe(409);
    expect(ERROR_STATUS.CLAIM_EXHAUSTED).toBe(ERROR_STATUS.CLAIM_ALREADY_REDEEMED);
  });
});
