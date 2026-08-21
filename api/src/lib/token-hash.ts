import { createHash } from 'node:crypto';

/** Single source of truth for hashing CLI/device secret tokens — sha256 hex digest. */
export function hashSecretToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
