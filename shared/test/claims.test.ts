import { describe, it, expect } from 'vitest';
import { ERROR_STATUS } from '../src/errors.js';
import { DEFAULT_CLAIM_EXPIRY_DAYS, MAX_CLAIM_EXPIRY_DAYS } from '../src/claims.js';

describe('claim error codes', () => {
  it('maps each claim error to its status', () => {
    expect(ERROR_STATUS.CLAIM_NOT_FOUND).toBe(404);
    expect(ERROR_STATUS.CLAIM_ALREADY_REDEEMED).toBe(409);
    expect(ERROR_STATUS.CLAIM_EXPIRED).toBe(410);
  });
});

describe('claim expiry bounds', () => {
  it('defaults to 30 days within a 365 day ceiling', () => {
    expect(DEFAULT_CLAIM_EXPIRY_DAYS).toBe(30);
    expect(MAX_CLAIM_EXPIRY_DAYS).toBe(365);
  });
});
