import { describe, it, expect } from 'vitest';
import {
  raceMetaKey, horseKey, parseHorseId,
  orgMetaKey, orgMemberKey, parseOrgId, parseMemberUserId,
  seriesPointKey, seriesPointPrefix,
} from '../../src/db/keys.js';

describe('keys', () => {
  it('formats race meta key', () => {
    expect(raceMetaKey('r123')).toEqual({ pk: 'RACE#r123', sk: 'META' });
  });

  it('formats horse key', () => {
    expect(horseKey('r123', 'h9')).toEqual({ pk: 'RACE#r123', sk: 'HORSE#h9' });
  });

  it('parses horse_id from sk', () => {
    expect(parseHorseId('HORSE#h9')).toBe('h9');
  });

  it('returns null when sk is not a horse', () => {
    expect(parseHorseId('META')).toBe(null);
  });

  it('formats org meta key', () => {
    expect(orgMetaKey('o42')).toEqual({ pk: 'ORG#o42', sk: 'META' });
  });

  it('formats org member key', () => {
    expect(orgMemberKey('o42', 'u9')).toEqual({ pk: 'ORG#o42', sk: 'MEMBER#u9' });
  });

  it('parses org_id from pk', () => {
    expect(parseOrgId('ORG#o42')).toBe('o42');
    expect(parseOrgId('RACE#r1')).toBe(null);
  });

  it('parses member user_id from sk', () => {
    expect(parseMemberUserId('MEMBER#u9')).toBe('u9');
    expect(parseMemberUserId('META')).toBe(null);
  });
});

describe('series point keys', () => {
  it('zero-pads seq so lexical order matches numeric order', () => {
    const k1 = seriesPointKey('race1', 'horseA', 9);
    const k2 = seriesPointKey('race1', 'horseA', 10);
    expect(k1.pk).toBe('RACE#race1');
    expect(k1.sk < k2.sk).toBe(true); // '...000009' < '...000010'
  });

  it('prefix targets exactly one horse', () => {
    expect(seriesPointKey('r', 'horseA', 1).sk.startsWith(seriesPointPrefix('horseA'))).toBe(true);
    expect(seriesPointKey('r', 'horseB', 1).sk.startsWith(seriesPointPrefix('horseA'))).toBe(false);
  });
});
