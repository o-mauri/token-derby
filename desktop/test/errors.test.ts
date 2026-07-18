import { describe, it, expect } from 'vitest';
import { errorMessage, errorRoute } from '../src/lib/errors.js';

describe('errorMessage', () => {
  it('describes a race that could not be found', () => {
    expect(errorMessage('RACE_NOT_FOUND')).toMatch(/not found/i);
  });

  it('falls back to a generic message for an unknown code', () => {
    expect(errorMessage('SOME_MADE_UP_CODE')).toBe('Something went wrong. Please try again.');
  });

  it('gives every ApiErrorCode a friendly message', () => {
    const codes = [
      'RACE_NOT_FOUND', 'RACE_FULL', 'RACE_FINISHED', 'INVALID_TOKEN', 'RATE_LIMITED',
      'BAD_REQUEST', 'VERSION_MISMATCH', 'IDENTITY_REQUIRED', 'DUPLICATE_HORSE',
      'ORG_NAME_TAKEN', 'ORG_NOT_FOUND', 'NOT_ORG_MEMBER', 'UNAUTHENTICATED',
      'STABLE_HORSE_NOT_FOUND', 'STABLE_HORSE_NAME_TAKEN', 'NETWORK_ERROR',
    ];
    for (const code of codes) {
      expect(errorMessage(code)).not.toBe('Something went wrong. Please try again.');
      expect(errorMessage(code).length).toBeGreaterThan(0);
    }
  });

  it('gives VERSION_MISMATCH its own desktop-authored update-required copy', () => {
    expect(errorMessage('VERSION_MISMATCH')).toMatch(/update/i);
  });
});

describe('errorRoute', () => {
  it('routes identity/auth failures back to onboarding', () => {
    expect(errorRoute('IDENTITY_REQUIRED')).toBe('reonboard');
    expect(errorRoute('UNAUTHENTICATED')).toBe('reonboard');
    expect(errorRoute('NO_IDENTITY')).toBe('reonboard');
  });

  it('routes a version mismatch to update-required', () => {
    expect(errorRoute('VERSION_MISMATCH')).toBe('update-required');
  });

  it('routes a vanished race to a friendly empty state', () => {
    expect(errorRoute('RACE_NOT_FOUND')).toBe('empty');
    expect(errorRoute('RACE_FINISHED')).toBe('empty');
  });

  it('has no special route for an ordinary error', () => {
    expect(errorRoute('RATE_LIMITED')).toBeNull();
    expect(errorRoute('SOME_MADE_UP_CODE')).toBeNull();
  });
});
