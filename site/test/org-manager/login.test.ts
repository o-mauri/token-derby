import { describe, it, expect, beforeEach } from 'vitest';
import { renderLogin } from '../../src/org-manager/render/login.js';

const GOOGLE_BRAND_FILLS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335'];

describe('renderLogin', () => {
  let root: HTMLElement;
  beforeEach(() => { root = document.createElement('div'); });

  it('offers Sign in with Google', () => {
    renderLogin(root);
    const btn = root.querySelector('a[href="/api/auth/google/start"], button[data-action="google-signin"]');
    expect(btn).not.toBeNull();
    expect(root.textContent).toMatch(/sign in with google/i);
  });

  it('renders exactly two lanes, one per audience', () => {
    renderLogin(root);
    const lanes = root.querySelectorAll('.org-login-lane');
    expect(lanes).toHaveLength(2);
  });

  it('puts the Google action and the CLI command in different lanes', () => {
    renderLogin(root);
    const googleLane = root.querySelector('.google-signin')!.closest('.org-login-lane');
    const cliLane = root.querySelector('.terminal-cmd')!.closest('.org-login-lane');
    expect(googleLane).not.toBeNull();
    expect(cliLane).not.toBeNull();
    expect(googleLane).not.toBe(cliLane);
  });

  it('shows the token-derby web command for existing CLI racers', () => {
    renderLogin(root);
    expect(root.querySelector('.terminal-cmd')?.textContent).toBe('token-derby web');
  });

  it('names the exact CLI command that would create a second jockey', () => {
    renderLogin(root);
    // The specific string, not a loose /init/i match — this is the safety-critical
    // prohibition that replaces the old post-button warning.
    expect(root.textContent).toContain('token-derby init');
    expect(root.textContent).toMatch(/second jockey/i);
  });

  it('renders the Google mark as inline SVG with the four brand fills, not an emoji or external image', () => {
    renderLogin(root);
    const mark = root.querySelector('a.google-signin svg.google-mark');
    expect(mark).not.toBeNull();
    expect(root.querySelector('a.google-signin img')).toBeNull();
    for (const fill of GOOGLE_BRAND_FILLS) {
      expect(mark!.innerHTML).toContain(fill);
    }
  });

  it('renders the horse SVG in the heading, not the emoji', () => {
    renderLogin(root);
    const h1 = root.querySelector('h1')!;
    expect(h1.querySelector('svg.horse-face')).not.toBeNull();
    expect(h1.textContent).not.toContain('\u{1F3C7}');
  });

  it('shows a message when the callback reported email_already_linked', () => {
    renderLogin(root, { authError: 'email_already_linked' });
    expect(root.textContent).toMatch(/already linked/i);
  });

  it('shows a generic message for an unknown error code', () => {
    renderLogin(root, { authError: 'wat' });
    const el = root.querySelector('.org-login-error');
    expect(el).not.toBeNull();
    // The generic fallback, not a blank banner and not the raw code.
    expect(el!.textContent).toMatch(/did not complete/i);
    expect(el!.textContent).not.toContain('wat');
  });

  it('shows no error block when there is no error', () => {
    renderLogin(root);
    expect(root.querySelector('.org-login-error')).toBeNull();
  });

  describe('the /cli variant', () => {
    // Phase 1 wrote the default copy for /org-manager, where "racing from the
    // CLI arrives in a later release" was true. It is false on /cli, where the
    // visitor has just run `token-derby login`.
    const STALE_SENTENCE = 'Racing from the CLI arrives in a later release';

    it('keeps the stale-lane sentence on the default (org-manager) rendering', () => {
      renderLogin(root);
      expect(root.textContent).toContain(STALE_SENTENCE);
      renderLogin(root, { variant: 'org-manager' });
      expect(root.textContent).toContain(STALE_SENTENCE);
    });

    it('suppresses it on /cli', () => {
      renderLogin(root, { variant: 'cli' });
      expect(root.textContent).not.toContain(STALE_SENTENCE);
      expect(root.textContent).not.toMatch(/later release/i);
    });

    it('still carries the init prohibition, which is true in both contexts', () => {
      renderLogin(root, { variant: 'cli' });
      expect(root.textContent).toContain('token-derby init');
      expect(root.textContent).toMatch(/second jockey/i);
    });

    it('is otherwise the same screen: two lanes and the Google button', () => {
      renderLogin(root, { variant: 'cli' });
      expect(root.querySelectorAll('.org-login-lane')).toHaveLength(2);
      expect(root.querySelector('a.google-signin[href="/api/auth/google/start"]')).not.toBeNull();
    });
  });
});
