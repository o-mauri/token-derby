import { describe, it, expect, afterEach, vi } from 'vitest';
import { chooseV2, isV2, isV2OnlyPath, markPromptDone, promptDone } from '../src/v2-opt-in.js';

const clearCookie = () => { document.cookie = 'td_site=; Path=/; Max-Age=0'; };

describe('v2 opt-in', () => {
  afterEach(() => { clearCookie(); localStorage.clear(); history.replaceState(null, '', '/'); });

  it('reads the cookie, alone or among others', () => {
    expect(isV2(document)).toBe(false);
    document.cookie = 'other=1; Path=/';
    document.cookie = 'td_site=v2; Path=/';
    expect(isV2(document)).toBe(true);
  });

  it('sets the cookie and reloads the same path and query, without the hash', () => {
    history.replaceState(null, '', '/org/acme?x=1#code=abc');
    const go = vi.fn();
    chooseV2(document, go);
    expect(isV2(document)).toBe(true);
    expect(go).toHaveBeenCalledWith('/org/acme?x=1');
  });

  it('does not reload when the cookie could not be set', () => {
    const go = vi.fn();
    const blocked = { get cookie() { return ''; }, set cookie(_v: string) {} } as unknown as Document;
    chooseV2(blocked, go);
    expect(go).not.toHaveBeenCalled();
  });

  it('remembers the prompt was answered', () => {
    expect(promptDone(localStorage)).toBe(false);
    markPromptDone(localStorage);
    expect(promptDone(localStorage)).toBe(true);
  });

  it('treats storage that throws as not answered, without crashing', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
    expect(promptDone(broken)).toBe(false);
    expect(() => markPromptDone(broken)).not.toThrow();
    expect(promptDone(null)).toBe(false);
  });

  it('knows the pages that only exist in v2', () => {
    for (const p of ['/paddock', '/account', '/account/devices', '/org/acme/races', '/org/acme/league', '/org/acme/settings', '/org/acme/settings/racing', '/catalog/rare', '/link-google', '/paddock/']) {
      expect(isV2OnlyPath(p), p).toBe(true);
    }
    for (const p of ['/', '/org/acme', '/org/acme/live', '/catalog', '/link', '/race/ABC', '/nope']) {
      expect(isV2OnlyPath(p), p).toBe(false);
    }
  });
});
