import { JOIN_CODE_ALPHABET } from './constants.js';

export const CLAIM_CODE_LENGTH = 12;

/**
 * Canonicalise a user-typed code: uppercase, dashes and whitespace stripped.
 * Returns null when the result is not a well-formed claim code.
 */
export function normaliseClaimCode(raw: string): string | null {
  const cleaned = raw.replace(/[\s-]/g, '').toUpperCase();
  if (cleaned.length !== CLAIM_CODE_LENGTH) return null;
  for (const ch of cleaned) {
    if (!JOIN_CODE_ALPHABET.includes(ch)) return null;
  }
  return cleaned;
}

/** Display form: XXXX-XXXX-XXXX. */
export function formatClaimCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1-');
}
