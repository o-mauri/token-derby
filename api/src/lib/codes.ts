import { randomBytes, randomUUID } from 'node:crypto';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@token-derby/shared';

export function generateJoinCode(): string {
  const bytes = randomBytes(JOIN_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    out += JOIN_CODE_ALPHABET[bytes[i]! % JOIN_CODE_ALPHABET.length];
  }
  return out;
}

export const generateRaceId = () => randomUUID();
export const generateHorseId = () => randomUUID();
export const generateAdminCode = () => randomUUID();
export const generateHeartbeatToken = () => randomUUID();
