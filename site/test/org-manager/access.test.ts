import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { OrgAccessSettings, GetOrganisationResponse } from '@token-derby/shared';
import { renderAccess } from '../../src/org-manager/render/tabs/access.js';
import { renderMembers } from '../../src/org-manager/render/tabs/members.js';
import * as api from '../../src/org-manager/api.js';
import { renderOrgManager } from '../../src/org-manager/index.js';
import { setSession, setUid } from '../../src/org-manager/session.js';

const goTo = (url: string) => history.replaceState(null, '', url);

function access(overrides: Partial<OrgAccessSettings> = {}): OrgAccessSettings {
  return {
    allowed_domains: [],
    join_token_enabled: true,
    domain_join_enabled: false,
    restrict_to_allowed_domains: false,
    ...overrides,
  };
}

function org(overrides: Partial<GetOrganisationResponse> = {}): GetOrganisationResponse {
  return {
    org_id: 'o1',
    org_name: 'Acme',
    org_join_token: 'td_join_original',
    created_at: '2026-05-14T00:00:00Z',
    creator_user_id: 'owner-1',
    creator_user_name: 'omar',
    access: access(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// renderAccess — unit level
// ---------------------------------------------------------------------------

describe('renderAccess', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it('toggling join_token_enabled calls onSave with the full body, that field flipped and the rest untouched', () => {
    const onSave = vi.fn();
    renderAccess(root, {
      access: access({ join_token_enabled: true, domain_join_enabled: true, allowed_domains: ['acme.com'] }),
      onSave, onRotate: vi.fn(),
    });
    (root.querySelector('[data-field="join_token_enabled"]') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith({
      join_token_enabled: false,
      domain_join_enabled: true,
      restrict_to_allowed_domains: false,
      allowed_domains: ['acme.com'],
    });
  });

  it('toggling restrict_to_allowed_domains calls onSave with the domain list intact', () => {
    const onSave = vi.fn();
    renderAccess(root, {
      access: access({ allowed_domains: ['acme.com', 'beta.io'] }),
      onSave, onRotate: vi.fn(),
    });
    (root.querySelector('[data-field="restrict_to_allowed_domains"]') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledWith({
      join_token_enabled: true,
      domain_join_enabled: false,
      restrict_to_allowed_domains: true,
      allowed_domains: ['acme.com', 'beta.io'],
    });
  });

  it('Save domains parses the textarea into a trimmed, blank-filtered list', () => {
    const onSave = vi.fn();
    renderAccess(root, { access: access(), onSave, onRotate: vi.fn() });
    const textarea = root.querySelector<HTMLTextAreaElement>('[data-field="allowed_domains"]')!;
    textarea.value = '  acme.com  \n\n beta.io \n';
    (root.querySelector('[data-action="save-domains"]') as HTMLElement).click();
    expect(onSave).toHaveBeenCalledWith({
      join_token_enabled: true,
      domain_join_enabled: false,
      restrict_to_allowed_domains: false,
      allowed_domains: ['acme.com', 'beta.io'],
    });
  });

  it('escapes a domain containing markup when rendering the textarea', () => {
    const XSS = '<img src=x onerror=alert(1)>';
    renderAccess(root, { access: access({ allowed_domains: [XSS] }), onSave: vi.fn(), onRotate: vi.fn() });
    // Not present as live markup...
    expect(root.innerHTML).not.toContain(XSS);
    expect(root.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // ...but the textarea's own value round-trips back to the original text,
    // proving it was inert markup and not, say, double-escaped.
    const textarea = root.querySelector<HTMLTextAreaElement>('[data-field="allowed_domains"]')!;
    expect(textarea.value).toBe(XSS);
  });

  describe('rotation', () => {
    let confirmFn: ReturnType<typeof vi.fn>;
    beforeEach(() => { confirmFn = vi.fn(() => true); vi.stubGlobal('confirm', confirmFn); });
    afterEach(() => vi.unstubAllGlobals());

    it('asks for confirmation before rotating', () => {
      const onRotate = vi.fn();
      renderAccess(root, { access: access(), onSave: vi.fn(), onRotate });
      (root.querySelector('[data-action="rotate"]') as HTMLElement).click();
      expect(confirmFn).toHaveBeenCalledTimes(1);
      expect(onRotate).toHaveBeenCalledTimes(1);
    });

    it('does not rotate when the confirmation is declined', () => {
      confirmFn.mockReturnValue(false);
      const onRotate = vi.fn();
      renderAccess(root, { access: access(), onSave: vi.fn(), onRotate });
      (root.querySelector('[data-action="rotate"]') as HTMLElement).click();
      expect(onRotate).not.toHaveBeenCalled();
    });

    it('warns that rotating invalidates the current token for everyone', () => {
      renderAccess(root, { access: access(), onSave: vi.fn(), onRotate: vi.fn() });
      (root.querySelector('[data-action="rotate"]') as HTMLElement).click();
      const message = confirmFn.mock.calls[0]![0] as string;
      expect(message.toLowerCase()).toContain('everyone');
      expect(message.toLowerCase()).toMatch(/invalidat/);
    });

    it('shows the freshly rotated token when one is passed', () => {
      renderAccess(root, { access: access(), rotatedToken: 'td_join_NEWTOKEN123', onSave: vi.fn(), onRotate: vi.fn() });
      expect(root.textContent).toContain('td_join_NEWTOKEN123');
    });

    it('shows no rotated-token banner when nothing has just been rotated', () => {
      renderAccess(root, { access: access(), onSave: vi.fn(), onRotate: vi.fn() });
      expect(root.querySelector('.org-secret')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// renderMembers — Remove button, unit level
// ---------------------------------------------------------------------------

describe('renderMembers — Remove', () => {
  let root: HTMLElement;
  let confirmFn: ReturnType<typeof vi.fn>;
  const members = [
    { user_id: 'owner-1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' },
    { user_id: 'u2', user_name: 'jess', joined_at: '2026-06-01T00:00:00Z' },
  ];

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    confirmFn = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmFn);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows no Remove buttons for a non-owner (the default)', () => {
    renderMembers(root, { members });
    expect(root.querySelectorAll('.org-member-remove').length).toBe(0);
  });

  it('shows Remove for every member except the owner, when viewed by the owner', () => {
    renderMembers(root, { members, isOwner: true, ownerUserId: 'owner-1', onRemove: vi.fn() });
    const buttons = root.querySelectorAll<HTMLButtonElement>('.org-member-remove');
    expect(buttons.length).toBe(1);
    expect(buttons[0]!.dataset.user).toBe('u2');
  });

  it('confirms before removing, naming the member and saying what happens', () => {
    renderMembers(root, { members, isOwner: true, ownerUserId: 'owner-1', onRemove: vi.fn() });
    (root.querySelector('.org-member-remove') as HTMLElement).click();
    expect(confirmFn).toHaveBeenCalledTimes(1);
    const message = confirmFn.mock.calls[0]![0] as string;
    expect(message).toContain('jess');
    expect(message.toLowerCase()).toContain('races and standings');
    expect(message.toLowerCase()).toContain('next season');
    // The honest part: removal is not a block, and this must not read as permanent.
    expect(message.toLowerCase()).toContain('rejoin');
  });

  it('calls onRemove with the user_id once confirmed', () => {
    const onRemove = vi.fn();
    renderMembers(root, { members, isOwner: true, ownerUserId: 'owner-1', onRemove });
    (root.querySelector('.org-member-remove') as HTMLElement).click();
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith('u2');
  });

  it('calls nothing when the confirmation is declined', () => {
    confirmFn.mockReturnValue(false);
    const onRemove = vi.fn();
    renderMembers(root, { members, isOwner: true, ownerUserId: 'owner-1', onRemove });
    (root.querySelector('.org-member-remove') as HTMLElement).click();
    expect(onRemove).not.toHaveBeenCalled();
  });

  it('escapes a member name containing live markup instead of rendering it', () => {
    const XSS = '<img src=x onerror=alert(1)>evil';
    renderMembers(root, {
      members: [{ user_id: 'u3', user_name: XSS, joined_at: '2026-06-01T00:00:00Z' }],
      isOwner: true, ownerUserId: 'owner-1', onRemove: vi.fn(),
    });
    // No live element was created from the name...
    expect(root.querySelector('img')).toBeNull();
    // ...but the text is still shown, as literal text.
    expect(root.textContent).toContain(XSS);
  });
});

// ---------------------------------------------------------------------------
// Full flow — the real composition through renderOrgManager, so a wire
// dropped between index.ts and the render modules fails here.
// ---------------------------------------------------------------------------

describe('Access tab & member removal — full flow', () => {
  let root: HTMLElement;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    goTo('/org-manager');
    setSession('tok');
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    goTo('/');
  });

  it('a non-owner sees neither the Access tab nor any Remove button', async () => {
    setUid('member-2');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [{ org_id: 'o1', org_name: 'Acme' }] });
    vi.spyOn(api, 'getOrganisation').mockResolvedValue(org({ creator_user_id: 'owner-1' }));
    vi.spyOn(api, 'getMembers').mockResolvedValue({
      members: [
        { user_id: 'owner-1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' },
        { user_id: 'member-2', user_name: 'jess', joined_at: '2026-06-01T00:00:00Z' },
      ],
    });

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-tabs')).not.toBeNull());
    const tabNames = Array.from(root.querySelectorAll<HTMLButtonElement>('.org-tab')).map((b) => b.dataset.tab);
    expect(tabNames).not.toContain('access');

    (root.querySelector('[data-tab="members"]') as HTMLElement).click();
    await vi.waitFor(() => expect(root.querySelector('.org-table')).not.toBeNull());
    expect(root.querySelector('.org-member-remove')).toBeNull();
  });

  it('an owner sees the Access tab and Remove on every row but their own', async () => {
    setUid('owner-1');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [{ org_id: 'o1', org_name: 'Acme' }] });
    vi.spyOn(api, 'getOrganisation').mockResolvedValue(org({ creator_user_id: 'owner-1' }));
    vi.spyOn(api, 'getMembers').mockResolvedValue({
      members: [
        { user_id: 'owner-1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' },
        { user_id: 'member-2', user_name: 'jess', joined_at: '2026-06-01T00:00:00Z' },
      ],
    });

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-tabs')).not.toBeNull());
    const tabNames = Array.from(root.querySelectorAll<HTMLButtonElement>('.org-tab')).map((b) => b.dataset.tab);
    expect(tabNames).toContain('access');

    (root.querySelector('[data-tab="members"]') as HTMLElement).click();
    await vi.waitFor(() => expect(root.querySelectorAll('.org-member-remove').length).toBe(1));
    expect(root.querySelector<HTMLButtonElement>('.org-member-remove')!.dataset.user).toBe('member-2');
  });

  it('toggling a setting on the live Access tab calls the PUT endpoint with the full settings body', async () => {
    setUid('owner-1');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [{ org_id: 'o1', org_name: 'Acme' }] });
    vi.spyOn(api, 'getOrganisation').mockResolvedValue(org({
      creator_user_id: 'owner-1',
      access: access({ join_token_enabled: true, domain_join_enabled: true, allowed_domains: ['acme.com'] }),
    }));
    const setAccessSpy = vi.spyOn(api, 'setOrgAccess').mockResolvedValue({
      access: access({ join_token_enabled: false, domain_join_enabled: true, allowed_domains: ['acme.com'] }),
    });

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-tabs')).not.toBeNull());
    (root.querySelector('[data-tab="access"]') as HTMLElement).click();
    await vi.waitFor(() => expect(root.querySelector('[data-field="join_token_enabled"]')).not.toBeNull());

    (root.querySelector('[data-field="join_token_enabled"]') as HTMLElement).click();

    await vi.waitFor(() => expect(setAccessSpy).toHaveBeenCalledTimes(1));
    expect(setAccessSpy).toHaveBeenCalledWith('Acme', {
      join_token_enabled: false,
      domain_join_enabled: true,
      restrict_to_allowed_domains: false,
      allowed_domains: ['acme.com'],
    });
  });

  it('DOMAIN_ALREADY_CLAIMED names the org holding the domain, not a bare code', async () => {
    setUid('owner-1');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [{ org_id: 'o1', org_name: 'Acme' }] });
    vi.spyOn(api, 'getOrganisation').mockResolvedValue(org({ creator_user_id: 'owner-1' }));
    vi.spyOn(api, 'setOrgAccess').mockRejectedValue(
      new Error('acme.com is already the auto-join domain for "RocketTeam"'),
    );
    const alertFn = vi.fn();
    vi.stubGlobal('alert', alertFn);

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-tabs')).not.toBeNull());
    (root.querySelector('[data-tab="access"]') as HTMLElement).click();
    await vi.waitFor(() => expect(root.querySelector('[data-field="domain_join_enabled"]')).not.toBeNull());

    (root.querySelector('[data-field="domain_join_enabled"]') as HTMLElement).click();

    await vi.waitFor(() => expect(alertFn).toHaveBeenCalledTimes(1));
    expect(alertFn.mock.calls[0]![0]).toContain('RocketTeam');
  });

  it('the lockout refusal explains itself rather than showing a bare code', async () => {
    setUid('owner-1');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [{ org_id: 'o1', org_name: 'Acme' }] });
    vi.spyOn(api, 'getOrganisation').mockResolvedValue(org({ creator_user_id: 'owner-1' }));
    vi.spyOn(api, 'setOrgAccess').mockRejectedValue(new Error(
      'Add at least one allowed domain before restricting joins to allowed domains — an empty list would lock everyone out, including you',
    ));
    const alertFn = vi.fn();
    vi.stubGlobal('alert', alertFn);

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-tabs')).not.toBeNull());
    (root.querySelector('[data-tab="access"]') as HTMLElement).click();
    await vi.waitFor(() => expect(root.querySelector('[data-field="restrict_to_allowed_domains"]')).not.toBeNull());

    (root.querySelector('[data-field="restrict_to_allowed_domains"]') as HTMLElement).click();

    await vi.waitFor(() => expect(alertFn).toHaveBeenCalledTimes(1));
    const message = String(alertFn.mock.calls[0]![0]).toLowerCase();
    expect(message).toContain('lock');
    expect(message).not.toBe('allow_list_required');
  });

  it('rotating the join token shows the new token once confirmed', async () => {
    setUid('owner-1');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [{ org_id: 'o1', org_name: 'Acme' }] });
    vi.spyOn(api, 'getOrganisation').mockResolvedValue(org({ creator_user_id: 'owner-1' }));
    vi.spyOn(api, 'rotateJoinToken').mockResolvedValue({ org_join_token: 'td_join_ROTATED999' });
    vi.stubGlobal('confirm', vi.fn(() => true));

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-tabs')).not.toBeNull());
    (root.querySelector('[data-tab="access"]') as HTMLElement).click();
    await vi.waitFor(() => expect(root.querySelector('[data-action="rotate"]')).not.toBeNull());

    (root.querySelector('[data-action="rotate"]') as HTMLElement).click();

    await vi.waitFor(() => expect(root.textContent).toContain('td_join_ROTATED999'));
  });

  it('removing a member confirms first, calls DELETE with the user_id, and drops the row', async () => {
    setUid('owner-1');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [{ org_id: 'o1', org_name: 'Acme' }] });
    vi.spyOn(api, 'getOrganisation').mockResolvedValue(org({ creator_user_id: 'owner-1' }));
    vi.spyOn(api, 'getMembers')
      .mockResolvedValueOnce({
        members: [
          { user_id: 'owner-1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' },
          { user_id: 'member-2', user_name: 'jess', joined_at: '2026-06-01T00:00:00Z' },
        ],
      })
      .mockResolvedValueOnce({
        members: [{ user_id: 'owner-1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' }],
      });
    const removeSpy = vi.spyOn(api, 'removeMember').mockResolvedValue({ ok: true });
    vi.stubGlobal('confirm', vi.fn(() => true));

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-tabs')).not.toBeNull());
    (root.querySelector('[data-tab="members"]') as HTMLElement).click();
    await vi.waitFor(() => expect(root.querySelector('.org-member-remove')).not.toBeNull());

    (root.querySelector('.org-member-remove') as HTMLElement).click();

    await vi.waitFor(() => expect(removeSpy).toHaveBeenCalledWith('Acme', 'member-2'));
    await vi.waitFor(() => expect(root.textContent).not.toContain('jess'));
  });

  it('declining the removal confirmation calls the endpoint nothing, and the row survives', async () => {
    setUid('owner-1');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [{ org_id: 'o1', org_name: 'Acme' }] });
    vi.spyOn(api, 'getOrganisation').mockResolvedValue(org({ creator_user_id: 'owner-1' }));
    vi.spyOn(api, 'getMembers').mockResolvedValue({
      members: [
        { user_id: 'owner-1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' },
        { user_id: 'member-2', user_name: 'jess', joined_at: '2026-06-01T00:00:00Z' },
      ],
    });
    const removeSpy = vi.spyOn(api, 'removeMember').mockResolvedValue({ ok: true });
    vi.stubGlobal('confirm', vi.fn(() => false));

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-tabs')).not.toBeNull());
    (root.querySelector('[data-tab="members"]') as HTMLElement).click();
    await vi.waitFor(() => expect(root.querySelector('.org-member-remove')).not.toBeNull());

    (root.querySelector('.org-member-remove') as HTMLElement).click();

    expect(removeSpy).not.toHaveBeenCalled();
    expect(root.textContent).toContain('jess');
  });

  it('CANNOT_REMOVE_OWNER explains itself if somehow triggered', async () => {
    setUid('owner-1');
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [{ org_id: 'o1', org_name: 'Acme' }] });
    vi.spyOn(api, 'getOrganisation').mockResolvedValue(org({ creator_user_id: 'owner-1' }));
    vi.spyOn(api, 'getMembers').mockResolvedValue({
      members: [
        { user_id: 'owner-1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' },
        { user_id: 'member-2', user_name: 'jess', joined_at: '2026-06-01T00:00:00Z' },
      ],
    });
    vi.spyOn(api, 'removeMember').mockRejectedValue(new Error('The organisation creator cannot be removed'));
    vi.stubGlobal('confirm', vi.fn(() => true));
    const alertFn = vi.fn();
    vi.stubGlobal('alert', alertFn);

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-tabs')).not.toBeNull());
    (root.querySelector('[data-tab="members"]') as HTMLElement).click();
    await vi.waitFor(() => expect(root.querySelector('.org-member-remove')).not.toBeNull());

    // The only Remove button present targets 'member-2' (the owner's own row
    // never gets one) — this simulates the server refusing anyway, so the
    // error path itself is exercised and stays legible if that guard ever slips.
    (root.querySelector('.org-member-remove') as HTMLElement).click();

    await vi.waitFor(() => expect(alertFn).toHaveBeenCalledWith('The organisation creator cannot be removed'));
  });
});
