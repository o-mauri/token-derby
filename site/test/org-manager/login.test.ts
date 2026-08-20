import { describe, it, expect, beforeEach } from 'vitest';
import { renderLogin } from '../../src/org-manager/render/login.js';

describe('renderLogin', () => {
  let root: HTMLElement;
  beforeEach(() => { root = document.createElement('div'); });

  it('offers Sign in with Google', () => {
    renderLogin(root);
    const btn = root.querySelector('a[href="/api/auth/google/start"], button[data-action="google-signin"]');
    expect(btn).not.toBeNull();
    expect(root.textContent).toMatch(/sign in with google/i);
  });

  it('warns existing CLI users that signing in directly creates a new jockey', () => {
    renderLogin(root);
    const text = root.textContent ?? '';
    expect(text).toMatch(/token-derby web/);
    expect(text).toMatch(/new jockey/i);
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
});
