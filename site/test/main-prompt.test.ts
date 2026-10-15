import { describe, it, expect, vi, beforeEach } from 'vitest';

// Boots the real main.ts at a URL and reports whether the v2 prompt card was mounted.
async function boot(url: string): Promise<boolean> {
  history.replaceState(null, '', url);
  document.body.innerHTML = '<div id="app"></div>';
  vi.resetModules();
  await import('../src/main.js');
  return document.querySelector('.v2-prompt') !== null;
}

describe('main.ts v2 prompt wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  });

  it('stays off while the org manager exchanges a sign-in #code=', async () => {
    expect(await boot('/org-manager#code=abc')).toBe(false);
    expect(window.location.hash).toBe('');
  });

  it('stays off the "Only on the new site" page, which has its own Try v2', async () => {
    expect(await boot('/paddock')).toBe(false);
    expect(document.querySelector('#app')?.textContent).toContain('Only on the new site');
  });

  it('shows on ordinary pages, including a plain not-found', async () => {
    expect(await boot('/about')).toBe(true);
    expect(await boot('/nope')).toBe(true);
  });
});
