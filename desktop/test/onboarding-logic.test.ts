import { describe, it, expect } from 'vitest';
import { validateDisplayName, buildPasteToken } from '../src/windows/onboarding-logic.js';

describe('validateDisplayName', () => {
  it('rejects an empty name', () => {
    expect(validateDisplayName('')).toEqual({ ok: false, error: 'Name cannot be empty.' });
  });

  it('rejects a whitespace-only name', () => {
    expect(validateDisplayName('   ')).toEqual({ ok: false, error: 'Name cannot be empty.' });
  });

  it('rejects a name over 40 characters', () => {
    const tooLong = 'a'.repeat(41);
    expect(validateDisplayName(tooLong)).toEqual({
      ok: false,
      error: 'Name must be 40 characters or fewer.',
    });
  });

  it('accepts a name exactly at the max length', () => {
    const atMax = 'a'.repeat(40);
    expect(validateDisplayName(atMax)).toEqual({ ok: true, name: atMax });
  });

  it('trims surrounding whitespace on success', () => {
    expect(validateDisplayName('  Alice  ')).toEqual({ ok: true, name: 'Alice' });
  });
});

describe('buildPasteToken', () => {
  it('joins the user id and secret token with a colon', () => {
    expect(buildPasteToken('user123', 'sekret')).toBe('user123:sekret');
  });

  it('trims whitespace from both fields before joining', () => {
    expect(buildPasteToken(' user123 ', ' sekret ')).toBe('user123:sekret');
  });
});
