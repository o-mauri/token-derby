import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderRace } from '../src/render/race.js';

describe('renderRace not found', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('replaces the race view with the not-found page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ code: 'RACE_NOT_FOUND', message: 'nope' }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    )));
    const root = document.createElement('div');
    const cleanup = renderRace(root, 'ABC123');
    await vi.advanceTimersByTimeAsync(0);

    expect(root.querySelector('.race')).toBeNull();
    expect(root.querySelector('.not-found h2')?.textContent).toBe('Race not found');
    expect(root.querySelector('.not-found p')?.textContent).toBe('No race with code ABC123.');
    expect(root.querySelector('.not-found a.btn')?.getAttribute('href')).toBe('/');
    cleanup();
  });
});

describe('main.ts unknown route', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    history.replaceState(null, '', '/no/such/page');
    vi.resetModules();
  });
  afterEach(() => { history.replaceState(null, '', '/'); });

  it('renders the not-found page', async () => {
    await import('../src/main.js');
    const nf = document.querySelector('#app > .not-found')!;
    expect(nf.querySelector('h2')?.textContent).toBe('Page not found');
    expect(nf.querySelector('a.btn')?.getAttribute('href')).toBe('/');
  });
});
