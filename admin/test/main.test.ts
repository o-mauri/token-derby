import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { boot } from '../src/main.js';
import { setToken, getToken, clearToken } from '../src/auth.js';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  root.id = 'app';
  document.body.appendChild(root);
  clearToken();
});
afterEach(() => {
  vi.restoreAllMocks();
});
async function flush() { await Promise.resolve(); await Promise.resolve(); }

describe('boot', () => {
  it('shows login when there is no token', async () => {
    boot(root);
    await flush();
    expect(root.querySelector('.login')).toBeTruthy();
  });

  it('shows the dashboard when a token is present', async () => {
    setToken('tok');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    boot(root);
    await flush();
    expect(root.querySelector('.topbar')).toBeTruthy();
  });

  it('clears the token and returns to login on unauthorized', async () => {
    setToken('stale');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHENTICATED', message: 'no' }), { status: 401, headers: { 'content-type': 'application/json' } }),
    );
    boot(root);
    await flush(); await flush();
    expect(getToken()).toBeNull();
    expect(root.querySelector('.login')).toBeTruthy();
  });
});
