import { describe, it, expect } from 'vitest';
import { raceMetaKey, horseKey, parseHorseId } from '../../src/db/keys.js';

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
});
