import { randomBytes } from 'node:crypto';
import { CLAIM_CODE_LENGTH, JOIN_CODE_ALPHABET } from '@token-derby/shared';

/** 12 chars from the unambiguous join-code alphabet. ~1.15e18 possibilities. */
export function generateClaimCode(): string {
  const bytes = randomBytes(CLAIM_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CLAIM_CODE_LENGTH; i++) {
    out += JOIN_CODE_ALPHABET[bytes[i]! % JOIN_CODE_ALPHABET.length];
  }
  return out;
}
