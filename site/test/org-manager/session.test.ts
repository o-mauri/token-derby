import { describe, it, expect, beforeEach } from 'vitest';
import { getSession, setSession, clearSession, getUid, setUid, clearUid, readCodeFromHash } from '../../src/org-manager/session.js';

beforeEach(() => { localStorage.clear(); window.location.hash = ''; });

describe('org-manager session', () => {
  it('stores and clears the session token', () => {
    expect(getSession()).toBeNull();
    setSession('tok123');
    expect(getSession()).toBe('tok123');
    clearSession();
    expect(getSession()).toBeNull();
  });

  it('stores and clears the uid in localStorage (survives tab reopen)', () => {
    expect(getUid()).toBeNull();
    setUid('user-42');
    expect(getUid()).toBe('user-42');
    expect(localStorage.getItem('td_org_uid')).toBe('user-42');
    clearUid();
    expect(getUid()).toBeNull();
  });

  it('clearSession also clears the uid, so logout wipes both', () => {
    setSession('tok123');
    setUid('user-42');
    clearSession();
    expect(getSession()).toBeNull();
    expect(getUid()).toBeNull();
  });

  it('reads the code from the hash and wipes it', () => {
    window.location.hash = '#code=ABC';
    expect(readCodeFromHash()).toBe('ABC');
    expect(window.location.hash).toBe('');
  });

  it('returns null when there is no code', () => {
    window.location.hash = '';
    expect(readCodeFromHash()).toBeNull();
  });
});
