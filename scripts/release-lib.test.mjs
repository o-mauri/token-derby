import { describe, it, expect } from 'vitest';
import { bumpVersion, resolveBump, findChangelogEntry } from './release-lib.mjs';

describe('bumpVersion', () => {
  it('bumps each segment and zeroes the rest', () => {
    expect(bumpVersion('2.12.3', 'patch')).toBe('2.12.4');
    expect(bumpVersion('2.12.3', 'minor')).toBe('2.13.0');
    expect(bumpVersion('2.12.3', 'major')).toBe('3.0.0');
  });
});

describe('resolveBump', () => {
  it('resolves the three bump kinds', () => {
    expect(resolveBump('site', '0.12.1', 'patch')).toEqual({ action: 'bump', version: '0.12.2' });
    expect(resolveBump('site', '0.12.1', 'MINOR')).toEqual({ action: 'bump', version: '0.13.0' });
    expect(resolveBump('cli', '2.12.3', ' major ')).toEqual({ action: 'bump', version: '3.0.0' });
  });

  it('allows none for the site', () => {
    expect(resolveBump('site', '0.12.1', 'none')).toEqual({ action: 'none' });
  });

  it('rejects none for the cli because npm forbids republishing', () => {
    const r = resolveBump('cli', '2.12.3', 'none');
    expect(r.action).toBe('reject');
    expect(r.reason).toContain('npm will not accept a duplicate version');
  });

  it('rejects anything else', () => {
    for (const answer of ['', 'nope', undefined]) {
      expect(resolveBump('site', '0.12.1', answer).action).toBe('reject');
    }
  });
});

describe('findChangelogEntry', () => {
  const log = [
    { version: '0.12.1', date: '2026-07-28', component: 'site', changes: ['jitter'] },
    { version: '2.12.3', date: '2026-07-28', component: 'cli', changes: ['stuck cli fixes'] },
  ];

  it('finds the entry for a component and version', () => {
    expect(findChangelogEntry(log, 'cli', '2.12.3').changes).toEqual(['stuck cli fixes']);
  });

  it('does not confuse components that share a version', () => {
    expect(() => findChangelogEntry(log, 'site', '2.12.3')).toThrow(/no changelog entry/);
  });

  it('throws when absent', () => {
    expect(() => findChangelogEntry(log, 'cli', '9.9.9')).toThrow(/no changelog entry for cli v9\.9\.9/);
  });
});
