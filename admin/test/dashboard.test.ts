import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AdminUsersResponse, AdminOrgsResponse } from '@token-derby/shared';
import { renderDashboard } from '../src/render/dashboard.js';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }

const users: AdminUsersResponse = {
  users: [{
    user_id: 'u1', display_name: 'omar', created_at: '2026-04-21T00:00:00Z',
    horses: [{
      stable_horse_id: 'sh1', name: 'Thunderbolt',
      colors: { body: '#c0392b', mane: '#000', tail: '#000', saddle: '#fff' },
      created_at: '2026-04-01T00:00:00Z', xp: 4210,
      races_entered: 14, wins: 6, podiums: 10, total_tokens: 1_900_000, total_finishing_position: 30,
    }],
  }],
};
const orgs: AdminOrgsResponse = {
  organisations: [{
    org_id: 'o1', org_name: 'StackOne', created_at: '2026-04-22T00:00:00Z',
    creator_user_id: 'u1', creator_user_name: 'omar',
    members: [{ user_id: 'u1', user_name: 'omar', joined_at: '2026-04-22T00:00:00Z' }],
  }],
};

function deps(over: Partial<Parameters<typeof renderDashboard>[1]> = {}) {
  return {
    fetchUsers: vi.fn(async () => users),
    fetchOrganisations: vi.fn(async () => orgs),
    onSignOut: vi.fn(),
    onUnauthorized: vi.fn(),
    ...over,
  };
}

describe('renderDashboard', () => {
  it('renders the users table and the orgs table', async () => {
    renderDashboard(root, deps());
    await flush();
    expect(root.textContent).toContain('omar');
    expect(root.textContent).toContain('StackOne');
    expect(root.querySelectorAll('tr.user-row').length).toBe(1);
  });

  it('expands a user row to show their horses on click', async () => {
    renderDashboard(root, deps());
    await flush();
    expect(root.textContent).not.toContain('Thunderbolt');
    (root.querySelector('tr.user-row') as HTMLElement).click();
    expect(root.textContent).toContain('Thunderbolt');
    expect(root.textContent).toContain('1.9M');
    (root.querySelector('tr.user-row') as HTMLElement).click();
    expect(root.textContent).not.toContain('Thunderbolt');
  });

  it('calls onUnauthorized when a fetch returns 401', async () => {
    const onUnauthorized = vi.fn();
    const fetchUsers = vi.fn(async () => { throw { status: 401 }; });
    renderDashboard(root, deps({ fetchUsers, onUnauthorized }));
    await flush();
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('calls onUnauthorized when the orgs fetch returns 401', async () => {
    const onUnauthorized = vi.fn();
    const fetchOrganisations = vi.fn(async () => { throw { status: 401 }; });
    renderDashboard(root, deps({ fetchOrganisations, onUnauthorized }));
    await flush();
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('signs out when the sign-out button is clicked', async () => {
    const onSignOut = vi.fn();
    renderDashboard(root, deps({ onSignOut }));
    await flush();
    (root.querySelector('.who button') as HTMLElement).click();
    expect(onSignOut).toHaveBeenCalled();
  });

  it('expands multiple user rows independently', async () => {
    const twoUsers: AdminUsersResponse = {
      users: [
        { user_id: 'u1', display_name: 'omar', created_at: '2026-04-21T00:00:00Z', horses: [{ stable_horse_id: 'sh1', name: 'Thunderbolt', colors: { body: '#c0392b', mane: '#000', tail: '#000', saddle: '#fff' }, created_at: '2026-04-01T00:00:00Z', xp: 10 }] },
        { user_id: 'u2', display_name: 'alex', created_at: '2026-05-02T00:00:00Z', horses: [{ stable_horse_id: 'sh2', name: 'Comet', colors: { body: '#2980b9', mane: '#000', tail: '#000', saddle: '#fff' }, created_at: '2026-05-01T00:00:00Z', xp: 5 }] },
      ],
    };
    renderDashboard(root, deps({ fetchUsers: vi.fn(async () => twoUsers) }));
    await flush();
    const rows = root.querySelectorAll('tr.user-row');
    expect(rows.length).toBe(2);
    (rows[0] as HTMLElement).click();
    (rows[1] as HTMLElement).click();
    expect(root.textContent).toContain('Thunderbolt');
    expect(root.textContent).toContain('Comet');
    (rows[0] as HTMLElement).click(); // collapse first only
    expect(root.textContent).not.toContain('Thunderbolt');
    expect(root.textContent).toContain('Comet');
  });
});
