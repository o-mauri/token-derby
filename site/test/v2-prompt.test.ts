import { describe, it, expect, afterEach, vi } from 'vitest';
import { createV2Prompt, shouldPrompt } from '../src/render/v2-prompt.js';

describe('v2 prompt', () => {
  afterEach(() => { localStorage.clear(); document.cookie = 'td_site=; Path=/; Max-Age=0'; document.body.innerHTML = ''; });

  it('says what it is and offers Try v2 / Not now', () => {
    const el = createV2Prompt(document);
    expect(el.tagName).toBe('ASIDE');
    expect(el.getAttribute('role')).toBeNull();
    expect(el.querySelector('#' + el.getAttribute('aria-labelledby'))?.textContent).toBe('Try the new Token Derby');
    expect(el.textContent).toContain('Try the new Token Derby');
    expect(el.textContent).toContain('You can switch back any time with the V2 switch at the top right.');
    expect(Array.from(el.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Try v2', 'Not now']);
  });

  it('Not now closes it for good', () => {
    const el = createV2Prompt(document);
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>('.v2-prompt-later')!.click();
    expect(document.querySelector('.v2-prompt')).toBeNull();
    expect(shouldPrompt('home', '')).toBe(false);
  });

  it('Try v2 opts in and is remembered', () => {
    const go = vi.fn();
    const el = createV2Prompt(document, { go });
    document.body.appendChild(el);
    el.querySelector<HTMLButtonElement>('.v2-prompt-try')!.click();
    expect(go).toHaveBeenCalled();
    expect(document.querySelector('.v2-prompt')).toBeNull();
    expect(localStorage.getItem('td_v2_prompt')).toBe('done');
  });

  it('shows on ordinary pages until answered, never on the TV view or sign-in hand-offs', () => {
    expect(shouldPrompt('home', '')).toBe(true);
    expect(shouldPrompt('race', '')).toBe(true);
    expect(shouldPrompt('org-live', '')).toBe(false);
    expect(shouldPrompt('cli', '')).toBe(false);
    expect(shouldPrompt('link', '')).toBe(false);
    expect(shouldPrompt('org-manager', '#code=abc')).toBe(false);
    expect(shouldPrompt('org-manager', '')).toBe(true);
  });

  it('still shows when storage is blocked', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } } as unknown as Storage;
    expect(shouldPrompt('home', '', broken)).toBe(true);
    expect(() => createV2Prompt(document, { storage: broken }).querySelector<HTMLButtonElement>('.v2-prompt-later')!.click()).not.toThrow();
  });
});
