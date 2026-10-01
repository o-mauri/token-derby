import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { parseRoute } from '../src/route.js';
import { renderLinkGoogle } from '../src/render/link-google.js';
import * as api from '../src/org-manager/api.js';
import { ApiError } from '../src/org-manager/api.js';
import { setSession, setUid, setLinkedEmail, getUid, getLinkedEmail } from '../src/org-manager/session.js';

describe('parseRoute /link', () => {
  it('maps "/link" to the link route', () => {
    expect(parseRoute('/link')).toEqual({ type: 'link' });
  });

  it('strips a trailing slash', () => {
    expect(parseRoute('/link/')).toEqual({ type: 'link' });
  });
});

describe('main.ts wiring for /link', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '<div id="app"></div>';
    history.replaceState(null, '', '/link');
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    history.replaceState(null, '', '/');
  });

  // main.ts is an if/else chain with a generic `else` that renders "Page not
  // found" for any route it doesn't explicitly branch on. A missing `link`
  // branch fails silently at runtime rather than at compile time, so this has
  // to go through main.ts's real route() dispatch, not call renderLinkGoogle
  // directly.
  it('renders the link page instead of falling through to the not-found branch', async () => {
    await import('../src/main.js');
    const app = document.querySelector('#app')!;
    expect(app.querySelector('.link-google')).not.toBeNull();
    expect(app.textContent).not.toMatch(/page not found/i);
  });
});

describe('renderLinkGoogle: grant in the fragment', () => {
  let root: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    root = document.createElement('div');
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('exchanges the grant, then calls link/start, then redirects to the returned authorize_url', async () => {
    window.location.hash = '#code=ABC';
    const exchangeSpy = vi.spyOn(api, 'exchangeCode').mockResolvedValue({
      token: 'tok', expires_at: '2026-01-01T00:00:00Z',
      user: { user_id: 'u1', display_name: 'Alice' },
    });
    const linkStartSpy = vi.spyOn(api, 'linkStart').mockResolvedValue({
      authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth?probe=1',
    });
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

    cleanup = renderLinkGoogle(root);

    await vi.waitFor(() => expect(assignSpy).toHaveBeenCalled());

    expect(exchangeSpy).toHaveBeenCalledWith('ABC');
    expect(linkStartSpy).toHaveBeenCalledTimes(1);
    // Ordering matters: link/start must not fire before the grant is exchanged.
    expect(exchangeSpy.mock.invocationCallOrder[0]!)
      .toBeLessThan(linkStartSpy.mock.invocationCallOrder[0]!);
    expect(assignSpy).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?probe=1');
  });

  it('scrubs the one-time code from the fragment (via the existing readCodeFromHash)', async () => {
    window.location.hash = '#code=ABC';
    vi.spyOn(api, 'exchangeCode').mockResolvedValue({
      token: 'tok', expires_at: '2026-01-01T00:00:00Z',
      user: { user_id: 'u1', display_name: 'Alice' },
    });
    vi.spyOn(api, 'linkStart').mockResolvedValue({ authorize_url: 'https://accounts.google.com/x' });
    vi.spyOn(window.location, 'assign').mockImplementation(() => {});

    cleanup = renderLinkGoogle(root);

    await vi.waitFor(() => expect(window.location.hash).toBe(''));
  });

  it('leaves no identity marker from the previous user attached to the new session', async () => {
    // The exchange only sets the session token. On a shared machine the uid and
    // linked-email keys would otherwise still describe whoever was here before,
    // and /org-manager reads all three independently.
    setUid('user-A');
    setLinkedEmail('a@example.com');
    window.location.hash = '#code=ABC';
    vi.spyOn(api, 'exchangeCode').mockResolvedValue({
      token: 'tok', expires_at: '2026-01-01T00:00:00Z',
      user: { user_id: 'u1', display_name: 'Alice' },
    });
    vi.spyOn(api, 'linkStart').mockResolvedValue({ authorize_url: 'https://accounts.google.com/x' });
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

    cleanup = renderLinkGoogle(root);

    await vi.waitFor(() => expect(assignSpy).toHaveBeenCalled());
    expect(getUid()).toBe('u1');
    expect(getLinkedEmail()).toBeNull();
  });

  it('shows a real error, not a blank page, when the exchange fails', async () => {
    window.location.hash = '#code=BAD';
    const exchangeSpy = vi.spyOn(api, 'exchangeCode').mockRejectedValue(new ApiError('INVALID_GRANT', 'That link has expired.', 400));
    const linkStartSpy = vi.spyOn(api, 'linkStart');
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

    cleanup = renderLinkGoogle(root);

    await vi.waitFor(() => expect(root.querySelector('.org-login-error')).not.toBeNull());
    expect(root.querySelector('.org-login-error')!.textContent).toBe('That link has expired.');
    expect(root.textContent).not.toBe('');
    expect(exchangeSpy).toHaveBeenCalledWith('BAD');
    expect(linkStartSpy).not.toHaveBeenCalled();
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it('shows a real error when link/start fails after a successful exchange', async () => {
    window.location.hash = '#code=ABC';
    vi.spyOn(api, 'exchangeCode').mockResolvedValue({
      token: 'tok', expires_at: '2026-01-01T00:00:00Z',
      user: { user_id: 'u1', display_name: 'Alice' },
    });
    vi.spyOn(api, 'linkStart').mockRejectedValue(new ApiError('NETWORK_ERROR', 'Could not reach the server.', 0));
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

    cleanup = renderLinkGoogle(root);

    await vi.waitFor(() => expect(root.querySelector('.org-login-error')).not.toBeNull());
    expect(root.querySelector('.org-login-error')!.textContent).toBe('Could not reach the server.');
    expect(assignSpy).not.toHaveBeenCalled();
  });
});

describe('renderLinkGoogle: existing session, no grant', () => {
  let root: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    setSession('tok');
    root = document.createElement('div');
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('skips the exchange and goes straight to link/start', async () => {
    const exchangeSpy = vi.spyOn(api, 'exchangeCode');
    const linkStartSpy = vi.spyOn(api, 'linkStart').mockResolvedValue({
      authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth?probe=2',
    });
    const assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => {});

    cleanup = renderLinkGoogle(root);

    await vi.waitFor(() => expect(assignSpy).toHaveBeenCalled());
    expect(exchangeSpy).not.toHaveBeenCalled();
    expect(linkStartSpy).toHaveBeenCalledTimes(1);
    expect(assignSpy).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?probe=2');
  });
});

describe('renderLinkGoogle: no grant and no session', () => {
  let root: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    root = document.createElement('div');
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('explains what the page is for and names `token-derby link`, rather than showing a blank screen', async () => {
    const linkStartSpy = vi.spyOn(api, 'linkStart');
    cleanup = renderLinkGoogle(root);

    // Nothing async is in flight in this branch, but await a tick so a wrongly
    // async-only implementation cannot slip past this assertion by accident.
    await vi.waitFor(() => expect(root.querySelector('.link-google-explain')).not.toBeNull());

    // The exact sentence, not a loose match — this copy IS the fix for the
    // Phase 2b bug (a Google button here would create a second jockey).
    expect(root.querySelector('.link-google-explain')!.textContent)
      .toBe('This page connects your Google account to your existing jockey. Run `token-derby link` in your terminal to get a fresh link here.');
    expect(root.textContent).toContain('token-derby link');
    expect(linkStartSpy).not.toHaveBeenCalled();
  });
});

describe('renderLinkGoogle: never renders a Google sign-in button', () => {
  let root: HTMLElement;
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    window.location.hash = '';
    root = document.createElement('div');
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  function assertNoGoogleButton(): void {
    // Security assertion, not cosmetic: this page exists specifically so an
    // unlinked account is never offered a Google sign-in control here, which
    // would silently create a second jockey (the Phase 2b bug).
    expect(root.querySelector('.google-signin')).toBeNull();
    expect(root.querySelector('[data-action="google-signin"]')).toBeNull();
    expect(root.querySelector('a[href="/api/auth/google/start"]')).toBeNull();
    expect(root.textContent).not.toMatch(/sign in with google/i);
  }

  it('in the no-grant/no-session explain state', async () => {
    cleanup = renderLinkGoogle(root);
    await vi.waitFor(() => expect(root.querySelector('.link-google-explain')).not.toBeNull());
    assertNoGoogleButton();
  });

  it('in the connecting state', async () => {
    window.location.hash = '#code=ABC';
    let resolveExchange!: (v: any) => void;
    vi.spyOn(api, 'exchangeCode').mockImplementation(() => new Promise((resolve) => { resolveExchange = resolve; }));

    cleanup = renderLinkGoogle(root);

    await vi.waitFor(() => expect(root.querySelector('.link-google-status')).not.toBeNull());
    assertNoGoogleButton();

    resolveExchange({ token: 'tok', expires_at: '2026-01-01T00:00:00Z', user: { user_id: 'u1', display_name: 'Alice' } });
  });

  it('in the error state', async () => {
    window.location.hash = '#code=BAD';
    vi.spyOn(api, 'exchangeCode').mockRejectedValue(new ApiError('INVALID_GRANT', 'That link has expired.', 400));

    cleanup = renderLinkGoogle(root);

    await vi.waitFor(() => expect(root.querySelector('.org-login-error')).not.toBeNull());
    assertNoGoogleButton();
  });
});
