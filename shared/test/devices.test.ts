import { describe, it, expect } from 'vitest';
import { normaliseUserCode } from '../src/devices.js';
import { JOIN_CODE_LENGTH } from '../src/constants.js';

describe('normaliseUserCode', () => {
  it('accepts a canonical 6-character code unchanged', () => {
    expect(normaliseUserCode('AB3D92')).toBe('AB3D92');
  });

  it('uppercases lower-case input', () => {
    expect(normaliseUserCode('ab3d92')).toBe('AB3D92');
  });

  it('strips dashes and whitespace', () => {
    expect(normaliseUserCode('AB3-D92')).toBe('AB3D92');
    expect(normaliseUserCode(' AB3D92 ')).toBe('AB3D92');
    expect(normaliseUserCode('AB 3D 92')).toBe('AB3D92');
  });

  it('rejects wrong lengths', () => {
    expect(normaliseUserCode('AB3D9')).toBeNull();
    expect(normaliseUserCode('AB3D922')).toBeNull();
    expect(normaliseUserCode('')).toBeNull();
  });

  it('rejects characters outside the join-code alphabet', () => {
    // I, O, 0 and 1 are deliberately absent from JOIN_CODE_ALPHABET.
    expect(normaliseUserCode('AB3D9I')).toBeNull();
    expect(normaliseUserCode('AB3D9O')).toBeNull();
    expect(normaliseUserCode('AB3D90')).toBeNull();
    expect(normaliseUserCode('AB3D91')).toBeNull();
    expect(normaliseUserCode('AB3D9!')).toBeNull();
  });

  it('agrees with the declared join-code length', () => {
    expect(JOIN_CODE_LENGTH).toBe(6);
  });
});
