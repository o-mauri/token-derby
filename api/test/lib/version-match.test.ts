import { describe, it, expect } from 'vitest';
import { parseSemver, minorMatches, gteSemver } from '@token-derby/shared';

describe('parseSemver', () => {
  it('parses canonical versions', () => {
    expect(parseSemver('0.2.0')).toEqual({ major: 0, minor: 2, patch: 0 });
    expect(parseSemver('1.10.27')).toEqual({ major: 1, minor: 10, patch: 27 });
  });

  it('parses versions with prerelease/build suffixes', () => {
    expect(parseSemver('1.2.3-beta.1')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('1.2.3+sha.abcdef')).toEqual({ major: 1, minor: 2, patch: 3 });
  });

  it('rejects garbage', () => {
    expect(parseSemver('not-a-version')).toBeNull();
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('')).toBeNull();
    expect(parseSemver(null)).toBeNull();
    expect(parseSemver(undefined)).toBeNull();
  });
});

describe('minorMatches', () => {
  it('matches same minor with different patches', () => {
    expect(minorMatches('0.2.0', '0.2.5')).toBe(true);
    expect(minorMatches('1.10.0', '1.10.99')).toBe(true);
  });

  it('rejects different minors', () => {
    expect(minorMatches('0.2.0', '0.3.0')).toBe(false);
    expect(minorMatches('1.2.0', '1.3.0')).toBe(false);
  });

  it('rejects different majors', () => {
    expect(minorMatches('0.2.0', '1.2.0')).toBe(false);
  });

  it('rejects when either side is invalid or missing', () => {
    expect(minorMatches(undefined, '0.2.0')).toBe(false);
    expect(minorMatches('0.2.0', undefined)).toBe(false);
    expect(minorMatches('garbage', '0.2.0')).toBe(false);
  });
});

describe('gteSemver', () => {
  it('returns true when a equals b', () => {
    expect(gteSemver('1.0.0', '1.0.0')).toBe(true);
  });

  it('returns true when a is newer by patch', () => {
    expect(gteSemver('1.0.1', '1.0.0')).toBe(true);
    expect(gteSemver('1.0.100', '1.0.99')).toBe(true);
  });

  it('returns true when a is newer by minor', () => {
    expect(gteSemver('1.1.0', '1.0.99')).toBe(true);
  });

  it('returns true when a is newer by major', () => {
    expect(gteSemver('2.0.0', '1.99.99')).toBe(true);
  });

  it('returns false when a is older', () => {
    expect(gteSemver('0.9.99', '1.0.0')).toBe(false);
    expect(gteSemver('1.0.0', '1.0.1')).toBe(false);
    expect(gteSemver('1.0.0', '1.1.0')).toBe(false);
  });

  it('returns false when either side is unparseable', () => {
    expect(gteSemver('garbage', '1.0.0')).toBe(false);
    expect(gteSemver('1.0.0', 'garbage')).toBe(false);
    expect(gteSemver(undefined, '1.0.0')).toBe(false);
    expect(gteSemver(null, '1.0.0')).toBe(false);
  });
});
