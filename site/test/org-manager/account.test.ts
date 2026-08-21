import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DeviceRecord } from '@token-derby/shared';
import { renderAccount } from '../../src/org-manager/render/account.js';
import * as api from '../../src/org-manager/api.js';
import { renderOrgManager } from '../../src/org-manager/index.js';
import { setSession, setLinkedEmail } from '../../src/org-manager/session.js';

const goTo = (url: string) => history.replaceState(null, '', url);

const device = (overrides: Partial<DeviceRecord> = {}): DeviceRecord => ({
  device_id: 'd1',
  label: "Omar's Laptop",
  created_at: '2026-05-01T09:30:00Z',
  last_seen_at: '2026-08-20T14:05:00Z',
  ...overrides,
});

describe('renderAccount', () => {
  let root: HTMLElement;
  let confirmFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    confirmFn = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmFn);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the linked email', () => {
    renderAccount(root, { hasLegacyCredential: false, email: 'alice@example.com', devices: [], onRevoke: vi.fn() });
    expect(root.textContent).toContain('alice@example.com');
  });

  it('renders a useful message when no Google account is linked', () => {
    renderAccount(root, { hasLegacyCredential: false, email: null, devices: [], onRevoke: vi.fn() });
    expect(root.textContent.toLowerCase()).toMatch(/no google account|not linked/);
  });

  it('renders a device row with label, created, and last-seen', () => {
    renderAccount(root, { hasLegacyCredential: false, email: 'a@example.com', devices: [device()], onRevoke: vi.fn() });
    expect(root.textContent).toContain("Omar's Laptop");
    expect(root.textContent).toContain('2026-05-01');
    expect(root.textContent).toContain('2026-08-20');
  });

  it('disambiguates two devices sharing a label by their distinct timestamps', () => {
    renderAccount(root, {
      hasLegacyCredential: false,
      email: 'a@example.com',
      devices: [
        device({ device_id: 'd1', created_at: '2026-05-01T09:30:00Z', last_seen_at: '2026-08-20T14:05:00Z' }),
        device({ device_id: 'd2', created_at: '2026-06-11T11:00:00Z', last_seen_at: '2026-08-19T08:00:00Z' }),
      ],
      onRevoke: vi.fn(),
    });
    const rows = root.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent).toContain('2026-05-01');
    expect(rows[1]!.textContent).toContain('2026-06-11');
  });

  it('disambiguates two devices registered within the same minute by seconds (a CI script or a re-run of login lands here)', () => {
    renderAccount(root, {
      hasLegacyCredential: false,
      email: 'a@example.com',
      devices: [
        device({ device_id: 'd1', created_at: '2026-08-20T09:30:11Z', last_seen_at: '2026-08-20T09:30:11Z' }),
        device({ device_id: 'd2', created_at: '2026-08-20T09:30:47Z', last_seen_at: '2026-08-20T09:30:47Z' }),
      ],
      onRevoke: vi.fn(),
    });
    const rows = root.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent).not.toBe(rows[1]!.textContent);
    expect(rows[0]!.textContent).toContain('09:30:11');
    expect(rows[1]!.textContent).toContain('09:30:47');
  });

  it('renders a useful empty state when there are no devices', () => {
    renderAccount(root, { hasLegacyCredential: false, email: 'a@example.com', devices: [], onRevoke: vi.fn() });
    expect(root.textContent.toLowerCase()).toMatch(/no devices|login/);
    expect(root.querySelectorAll('tbody tr').length).toBe(1); // the empty-state row itself
  });

  it('escapes a label containing live HTML instead of rendering it as markup', () => {
    const XSS = '<img src=x onerror=alert(1)>evil-device';
    renderAccount(root, { hasLegacyCredential: false, email: 'a@example.com', devices: [device({ label: XSS })], onRevoke: vi.fn() });
    expect(root.querySelector('img')).toBeNull();
    expect(root.innerHTML).not.toContain('<img src=x');
    expect(root.textContent).toContain(XSS);
  });

  it('asks for confirmation before revoking, and does nothing if the user declines', () => {
    confirmFn.mockReturnValue(false);
    const onRevoke = vi.fn();
    renderAccount(root, { hasLegacyCredential: false, email: 'a@example.com', devices: [device()], onRevoke });
    (root.querySelector('.org-device-revoke') as HTMLElement).click();
    expect(confirmFn).toHaveBeenCalledTimes(1);
    expect(onRevoke).not.toHaveBeenCalled();
  });

  it('calls onRevoke with the device_id once the user confirms', () => {
    confirmFn.mockReturnValue(true);
    const onRevoke = vi.fn();
    renderAccount(root, { hasLegacyCredential: false, email: 'a@example.com', devices: [device({ device_id: 'd42' })], onRevoke });
    (root.querySelector('.org-device-revoke') as HTMLElement).click();
    expect(onRevoke).toHaveBeenCalledWith('d42');
  });

  it("the confirmation says plainly that this will not log the user out of the web", () => {
    renderAccount(root, { hasLegacyCredential: false, email: 'a@example.com', devices: [device()], onRevoke: vi.fn() });
    (root.querySelector('.org-device-revoke') as HTMLElement).click();
    const message = confirmFn.mock.calls[0]![0] as string;
    expect(message.toLowerCase()).toMatch(/not log you out|won't log you out|will not log you out/);
  });

  it('removes the row from the list once revoke resolves (full composition, not just the callback)', async () => {
    let devices = [device({ device_id: 'd1' }), device({ device_id: 'd2', label: 'Second box' })];
    const onRevoke = vi.fn((id: string) => {
      devices = devices.filter((d) => d.device_id !== id);
      draw();
    });
    function draw() { renderAccount(root, { hasLegacyCredential: false, email: 'a@example.com', devices, onRevoke }); }
    draw();

    expect(root.querySelectorAll('tbody tr').length).toBe(2);
    (root.querySelector('[data-device="d1"] .org-device-revoke') as HTMLElement).click();

    expect(root.querySelectorAll('tbody tr').length).toBe(1);
    expect(root.textContent).not.toContain("Omar's Laptop");
    expect(root.textContent).toContain('Second box');
  });

  it('links /cli from the empty state, the only place the site points at the approval page', () => {
    renderAccount(root, { hasLegacyCredential: false, email: 'a@example.com', devices: [], onRevoke: vi.fn() });
    expect(root.querySelector('a[href="/cli"]')).not.toBeNull();
    expect(root.textContent).toContain('token-derby login');
  });

  describe('the legacy account credential', () => {
    it('says plainly that one exists and is not in the list', () => {
      renderAccount(root, {
        hasLegacyCredential: true,
        email: 'a@example.com',
        devices: [device()],
        onRevoke: vi.fn(),
      });
      const note = root.querySelector('.org-account-legacy');
      expect(note).not.toBeNull();
      // Both halves of the honesty gap, not a loose match: that it is missing
      // from the table, and that revoking the table does not touch it.
      expect(note!.textContent).toContain('not listed above');
      expect(note!.textContent!.toLowerCase()).toMatch(/revoking these devices does not affect it/);
      expect(note!.textContent).toContain('identity.json');
    });

    it('shows the warning even when the device list is empty — the exact moment the view reads as "nothing can act as me"', () => {
      renderAccount(root, { hasLegacyCredential: true, email: 'a@example.com', devices: [], onRevoke: vi.fn() });
      expect(root.querySelector('.org-account-legacy')).not.toBeNull();
      // The empty-state row and the warning have to coexist: the row alone is
      // the false reassurance this exists to remove.
      expect(root.textContent!.toLowerCase()).toContain('no devices yet');
    });

    it('says nothing at all when the account has no legacy credential', () => {
      renderAccount(root, { hasLegacyCredential: false, email: 'a@example.com', devices: [device()], onRevoke: vi.fn() });
      expect(root.querySelector('.org-account-legacy')).toBeNull();
      expect(root.textContent).not.toContain('identity.json');
    });
  });
});

describe('Account view reachability with zero organisations (sidebar, not a tab)', () => {
  let root: HTMLElement;
  let dispose: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    goTo('/org-manager');
    setSession('tok');
    setLinkedEmail('zero-orgs@example.com');
  });

  afterEach(() => {
    dispose?.();
    dispose = null;
    vi.restoreAllMocks();
    goTo('/');
  });

  it('is reachable from the sidebar and renders devices even when the user has no organisations', async () => {
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [] });
    vi.spyOn(api, 'listDevices').mockResolvedValue({ devices: [device()], has_legacy_credential: false });

    dispose = renderOrgManager(root);

    await vi.waitFor(() => expect(root.querySelector('.org-side')).not.toBeNull());
    // The exact bug this task exists to prevent: a tab would be unreachable here.
    expect(root.querySelector('.org-tabs')).toBeNull();
    expect(root.querySelector('.org-account-row')).not.toBeNull();

    (root.querySelector('.org-account-row') as HTMLElement).click();

    await vi.waitFor(() => expect(root.textContent).toContain("Omar's Laptop"));
    expect(root.textContent).toContain('zero-orgs@example.com');
    expect(root.querySelector('.org-tabs')).toBeNull();
  });

  it('surfaces the API has_legacy_credential flag in the live view, not just in renderAccount', async () => {
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [] });
    vi.spyOn(api, 'listDevices').mockResolvedValue({ devices: [], has_legacy_credential: true });

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-account-row')).not.toBeNull());
    (root.querySelector('.org-account-row') as HTMLElement).click();

    // Goes through the real composition, so a flag dropped between the API
    // response and the renderer fails here rather than passing on both sides.
    await vi.waitFor(() => expect(root.querySelector('.org-account-legacy')).not.toBeNull());
  });

  it('revoking a device from the live view calls the DELETE endpoint and removes the row', async () => {
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [] });
    vi.spyOn(api, 'listDevices')
      .mockResolvedValueOnce({ devices: [device()], has_legacy_credential: false })   // initial draw
      .mockResolvedValueOnce({ devices: [], has_legacy_credential: false });          // re-fetch after revoke
    const deleteSpy = vi.spyOn(api, 'deleteDevice').mockResolvedValue({ ok: true });
    vi.stubGlobal('confirm', vi.fn(() => true));

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-account-row')).not.toBeNull());
    (root.querySelector('.org-account-row') as HTMLElement).click();
    await vi.waitFor(() => expect(root.querySelector('.org-device-revoke')).not.toBeNull());

    (root.querySelector('.org-device-revoke') as HTMLElement).click();

    await vi.waitFor(() => expect(deleteSpy).toHaveBeenCalledWith('d1'));
    await vi.waitFor(() => expect(root.textContent).not.toContain("Omar's Laptop"));
    vi.unstubAllGlobals();
  });

  it('keeps the row and tells the user when the DELETE call fails, rather than re-rendering as if it succeeded', async () => {
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [] });
    const listSpy = vi.spyOn(api, 'listDevices').mockResolvedValue({ devices: [device()], has_legacy_credential: false });
    vi.spyOn(api, 'deleteDevice').mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('confirm', vi.fn(() => true));
    const alertFn = vi.fn();
    vi.stubGlobal('alert', alertFn);

    dispose = renderOrgManager(root);
    await vi.waitFor(() => expect(root.querySelector('.org-account-row')).not.toBeNull());
    (root.querySelector('.org-account-row') as HTMLElement).click();
    await vi.waitFor(() => expect(root.querySelector('.org-device-revoke')).not.toBeNull());
    await vi.waitFor(() => expect(listSpy).toHaveBeenCalledTimes(1));

    (root.querySelector('.org-device-revoke') as HTMLElement).click();

    await vi.waitFor(() => expect(alertFn).toHaveBeenCalledWith('Network error'));
    // The row must still be there — a failed revoke is not a successful one.
    expect(root.textContent).toContain("Omar's Laptop");
    expect(root.querySelector('.org-device-revoke')).not.toBeNull();
    // The load-bearing assertion: a failed delete must not trigger a re-fetch
    // at all (a re-fetch would coincidentally still show the row in this test
    // via the static mock, masking a version of this bug that re-renders
    // unconditionally after a failure).
    expect(listSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('the no-organisation empty state (Phase 1 review finding I5)', () => {
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

  afterEach(() => { dispose?.(); dispose = null; vi.restoreAllMocks(); });

  it('points at `token-derby login` and never at `init`', async () => {
    vi.spyOn(api, 'listOrganisations').mockResolvedValue({ organisations: [] });

    dispose = renderOrgManager(root);

    await vi.waitFor(() => expect(root.textContent).toContain('token-derby login'));
    // `init` on an account that already exists mints a SECOND jockey — the exact
    // duplicate the linking design prevents. Naming it here would be harmful advice,
    // and the copy said nothing about racing at all until Phase 2 made login real.
    expect(root.textContent).not.toContain('token-derby init');
    // And it links /cli: the code expires in 600 seconds, so telling someone to
    // run `login` without saying where to approve it costs them the whole flow.
    expect(root.querySelector('.org-empty a[href="/cli"]')).not.toBeNull();
  });
});
