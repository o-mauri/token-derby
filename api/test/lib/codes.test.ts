import { describe, it, expect } from 'vitest';
import { generateJoinCode, generateRaceId, generateHorseId, generateAdminCode, generateHeartbeatToken, generateOrgId, generateOrgJoinToken } from '../../src/lib/codes.js';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '@token-derby/shared';

describe('codes', () => {
  it('generates a 6-char join code from the allowed alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(JOIN_CODE_LENGTH);
      expect([...code].every(c => JOIN_CODE_ALPHABET.includes(c))).toBe(true);
    }
  });

  it('produces varied join codes', () => {
    const codes = new Set(Array.from({ length: 100 }, generateJoinCode));
    expect(codes.size).toBeGreaterThan(90);
  });

  it('generates UUID-like identifiers', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(generateRaceId()).toMatch(uuid);
    expect(generateHorseId()).toMatch(uuid);
    expect(generateAdminCode()).toMatch(uuid);
    expect(generateHeartbeatToken()).toMatch(uuid);
    expect(generateOrgId()).toMatch(uuid);
    expect(generateOrgJoinToken()).toMatch(uuid);
  });
});
