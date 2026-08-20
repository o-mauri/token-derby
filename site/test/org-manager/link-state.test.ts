import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as api from '../../src/org-manager/api.js';
import { renderOrgManager } from '../../src/org-manager/index.js';
import { getLinkedEmail, setSession } from '../../src/org-manager/session.js';

const goTo = (url: string) => history.replaceState(null, '', url);

describe('Google-linked sidebar state on /org-manager', () => {
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

  it('shows the linked email and no actionable link button when the exchange returns one', async () => {
    window.location.hash = '#code=ABC';
    // The real exchangeCode also calls setSession as a side effect; the mock must too.
    vi.spyOn(api, 'exchangeCode').mockImplementation(async () => {
      setSession('tok');
      return {
        token: 'tok', expires_at: '2026-01-01T00:00:00Z',
        user: { user_id: 'u1', display_name: 'Alice', email: 'alice@example.com' },
      };
    });
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [] });

    dispose = renderOrgManager(root);

    await vi.waitFor(() => expect(root.querySelector('.org-side')).not.toBeNull());
    // The whole bug: a linked account must not still offer a clickable link-account control.
    expect(root.querySelector('.org-link-google')).toBeNull();
    expect(root.textContent).toContain('alice@example.com');
    expect(getLinkedEmail()).toBe('alice@example.com');
  });

  it('keeps the Link Google button when the exchange returns no email', async () => {
    window.location.hash = '#code=ABC';
    vi.spyOn(api, 'exchangeCode').mockImplementation(async () => {
      setSession('tok');
      return {
        token: 'tok', expires_at: '2026-01-01T00:00:00Z',
        user: { user_id: 'u1', display_name: 'Alice' },
      };
    });
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [] });

    dispose = renderOrgManager(root);

    await vi.waitFor(() => expect(root.querySelector('.org-side')).not.toBeNull());
    expect(root.querySelector('.org-link-google')).not.toBeNull();
    expect(getLinkedEmail()).toBeNull();
  });
});
