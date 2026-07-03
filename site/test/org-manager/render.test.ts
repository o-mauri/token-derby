import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderLogin } from '../../src/org-manager/render/login.js';
import { renderSidebar } from '../../src/org-manager/render/sidebar.js';
import { renderOverview } from '../../src/org-manager/render/tabs/overview.js';
import { renderSchedule } from '../../src/org-manager/render/tabs/schedule.js';
import { renderWebhook } from '../../src/org-manager/render/tabs/webhook.js';
import { renderMembers } from '../../src/org-manager/render/tabs/members.js';

let root: HTMLElement;
beforeEach(() => { document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root); });

describe('renderLogin', () => {
  it('shows the CLI instruction', () => {
    renderLogin(root);
    expect(root.textContent).toContain('token-derby web');
  });
});

describe('renderSidebar', () => {
  it('lists orgs with owner/member pills and fires onSelect', () => {
    const onSelect = vi.fn();
    renderSidebar(root, {
      orgs: [{ org_id: 'o1', org_name: 'Acme' }],
      selected: 'Acme', ownerOrgs: new Set(['Acme']),
      onSelect, onCreate: vi.fn(), onJoin: vi.fn(), onLogout: vi.fn(),
    });
    expect(root.textContent).toContain('Acme');
    expect(root.textContent.toLowerCase()).toContain('owner');
    (root.querySelector('[data-org="Acme"]') as HTMLElement).click();
    expect(onSelect).toHaveBeenCalledWith('Acme');
  });
});

describe('renderOverview', () => {
  it('renders the join token and creator', () => {
    renderOverview(root, {
      org: { org_id: 'o1', org_name: 'Acme', org_join_token: 'JOIN-XYZ',
        created_at: '2026-05-14T00:00:00Z', creator_user_id: 'u1', creator_user_name: 'omar' },
    });
    expect(root.textContent).toContain('JOIN-XYZ');
    expect(root.textContent).toContain('omar');
  });
});

describe('renderSchedule', () => {
  it('hides Save/Clear for non-owners', () => {
    renderSchedule(root, { schedule: null, isOwner: false, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('button[data-action="save"]')).toBeNull();
  });
  it('shows Save for owners', () => {
    renderSchedule(root, { schedule: null, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('button[data-action="save"]')).toBeTruthy();
  });
});

describe('renderWebhook', () => {
  it('hides Save/Clear for non-owners', () => {
    renderWebhook(root, { webhook: null, isOwner: false, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('button[data-action="save"]')).toBeNull();
    expect(root.querySelector('button[data-action="clear"]')).toBeNull();
  });
  it('shows Save/Clear for owners', () => {
    renderWebhook(root, { webhook: null, isOwner: true, onSave: vi.fn(), onClear: vi.fn() });
    expect(root.querySelector('button[data-action="save"]')).toBeTruthy();
    expect(root.querySelector('button[data-action="clear"]')).toBeTruthy();
  });
});

describe('renderMembers', () => {
  it('renders member names and escapes a name containing <', () => {
    renderMembers(root, {
      members: [
        { user_id: 'u1', user_name: 'omar', joined_at: '2026-05-14T00:00:00Z' },
        { user_id: 'u2', user_name: '<script>evil</script>', joined_at: '2026-05-15T00:00:00Z' },
      ],
    });
    expect(root.textContent).toContain('omar');
    expect(root.innerHTML).not.toContain('<script>evil</script>');
    expect(root.innerHTML).toContain('&lt;script&gt;evil&lt;/script&gt;');
  });
});
