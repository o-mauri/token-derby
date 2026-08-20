import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as api from '../../src/org-manager/api.js';
import { renderOrgManager } from '../../src/org-manager/index.js';
import { setSession } from '../../src/org-manager/session.js';

const goTo = (url: string) => history.replaceState(null, '', url);

describe('auth_error on /org-manager', () => {
  let root: HTMLElement;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    goTo('/org-manager');
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    vi.restoreAllMocks();
    goTo('/');
  });

  it('shows the error in the signed-in shell, which is where a link failure lands', async () => {
    setSession('tok');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [] });
    goTo('/org-manager?auth_error=email_already_linked');

    dispose = renderOrgManager(root);

    await vi.waitFor(() => expect(root.querySelector('.org-auth-error')).not.toBeNull());
    expect(root.querySelector('.org-auth-error')!.textContent).toMatch(/already linked/i);
    // The shell itself must still render — the banner is additive, not a replacement.
    expect(root.querySelector('.org-manager')).not.toBeNull();
    expect(root.querySelector('.org-side')).not.toBeNull();
    expect(root.querySelector('.org-main')).not.toBeNull();
  });

  it('drops auth_error from the URL on the signed-in path so a reload is clean', async () => {
    setSession('tok');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [] });
    goTo('/org-manager?auth_error=expired&keep=1');

    dispose = renderOrgManager(root);

    await vi.waitFor(() => expect(root.querySelector('.org-auth-error')).not.toBeNull());
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.pathname).toBe('/org-manager');
  });

  it('renders no banner when there is no auth_error', async () => {
    setSession('tok');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [] });

    dispose = renderOrgManager(root);

    await vi.waitFor(() => expect(root.querySelector('.org-manager')).not.toBeNull());
    expect(root.querySelector('.org-auth-error')).toBeNull();
  });

  it('still shows the error on the signed-out path, and drops the param there too', async () => {
    goTo('/org-manager?auth_error=sso_failed');

    dispose = renderOrgManager(root);

    await vi.waitFor(() => expect(root.querySelector('.org-login-error')).not.toBeNull());
    expect(root.querySelector('.org-login-error')!.textContent).toMatch(/did not complete/i);
    expect(window.location.search).toBe('');
  });
});
