import { describe, it, expect } from 'vitest';
import { normaliseUserCode, validateDeviceLabel } from '../src/devices.js';
import { DEVICE_LABEL_MAX_LENGTH, JOIN_CODE_LENGTH } from '../src/constants.js';

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

// Lives in shared so the api endpoints and the CLI's `--device-name` pre-flight
// check cannot drift into disagreeing about what a label may contain.
describe('validateDeviceLabel', () => {
  it('accepts an ordinary label and returns it trimmed', () => {
    expect(validateDeviceLabel('  omars-laptop  ')).toEqual({ ok: true, label: 'omars-laptop' });
  });

  it('accepts accents and CJK, which are not control or format characters', () => {
    expect(validateDeviceLabel("Amélie's PC 笔记本")).toEqual({ ok: true, label: "Amélie's PC 笔记本" });
  });

  it('accepts a label at exactly the maximum length and rejects one character more', () => {
    expect(validateDeviceLabel('x'.repeat(DEVICE_LABEL_MAX_LENGTH)).ok).toBe(true);
    expect(validateDeviceLabel('x'.repeat(DEVICE_LABEL_MAX_LENGTH + 1)).ok).toBe(false);
  });

  it('rejects a non-string, including undefined', () => {
    expect(validateDeviceLabel(undefined)).toEqual({ ok: false, message: 'label is required' });
    expect(validateDeviceLabel(42).ok).toBe(false);
  });

  it('rejects a label that is only whitespace', () => {
    const r = validateDeviceLabel('   ');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.message).toMatch(/characters/);
  });

  it('rejects control and invisible characters, which is why this is not just a length check', () => {
    // A newline, a right-to-left override and a zero-width space: each one lets
    // the label render as something other than what was typed.
    for (const label of ['laptop\nadmin', 'AB3D92‮cod.exe', 'omars​laptop']) {
      const r = validateDeviceLabel(label);
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.message).toMatch(/control or invisible/);
    }
  });
});
