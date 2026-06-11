import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AdminUser } from '@token-derby/shared';
import { renderUsersTable } from '../src/render/users-table.js';

let root: HTMLElement;
beforeEach(() => { document.body.innerHTML = ''; root = document.createElement('div'); document.body.appendChild(root); });

function users(): AdminUser[] {
  return [{
    user_id: 'u1', display_name: 'omar', created_at: '2026-04-21T00:00:00Z',
    horses: [{
      stable_horse_id: 'h1', name: 'Thunderbolt',
      colors: { body: '#c0392b', mane: '#000', tail: '#000', saddle: '#fff' },
      created_at: '2026-04-01T00:00:00Z', xp: 100, races_entered: 5, wins: 2,
      equipped_hat: 1,
      hats: [
        { id: 'flat_cap', variant: 0, obtained_at: '2026-04-02T00:00:00Z' },
        { id: 'beanie', variant: 0, obtained_at: '2026-04-05T00:00:00Z' },
      ],
    }],
  }];
}

function mutations(over: Partial<Parameters<typeof renderUsersTable>[1]['mutations']> = {}) {
  return {
    renameUser: vi.fn(async (_id: string, name: string) => ({ user_id: 'u1', display_name: name })),
    renameHorse: vi.fn(async (_u: string, _h: string, name: string) => ({ ...users()[0].horses[0], name })),
    removeHat: vi.fn(async () => ({ ...users()[0].horses[0], hats: [users()[0].horses[0].hats![0]], equipped_hat: 0 })),
    deleteHorse: vi.fn(async () => {}),
    ...over,
  };
}

function opts(over: any = {}) {
  return { users: users(), editMode: false, mutations: mutations(over.mutations), onUnauthorized: vi.fn(), confirmFn: () => true, ...over };
}

function click(el: Element | null) { (el as HTMLElement).click(); }

describe('renderUsersTable', () => {
  it('renders rows and hides edit controls when editMode is off', () => {
    renderUsersTable(root, opts());
    expect(root.querySelector('tr.user-row')).toBeTruthy();
    click(root.querySelector('tr.user-row'));
    expect(root.querySelector('[data-action="edit-user-name"]')).toBeNull();
    expect(root.querySelector('[data-action="delete-horse"]')).toBeNull();
  });

  it('shows pencils and delete buttons after setEditMode(true)', () => {
    const handle = renderUsersTable(root, opts());
    click(root.querySelector('tr.user-row'));   // expand
    handle.setEditMode(true);                    // controls appear, row stays expanded
    expect(root.querySelector('[data-action="edit-user-name"]')).toBeTruthy();
    expect(root.querySelector('[data-action="delete-horse"]')).toBeTruthy();
  });

  it('renames a user via the inline input', async () => {
    const m = mutations();
    renderUsersTable(root, opts({ mutations: m, editMode: true }));
    click(root.querySelector('tr.user-row'));
    click(root.querySelector('[data-action="edit-user-name"]'));
    (root.querySelector('[data-edit-input]') as HTMLInputElement).value = 'NewName';
    click(root.querySelector('[data-action="save-user-name"]'));
    await Promise.resolve(); await Promise.resolve();
    expect(m.renameUser).toHaveBeenCalledWith('u1', 'NewName');
    expect(root.textContent).toContain('NewName');
  });

  it('shows the hat list and removes a hat (confirm = true)', async () => {
    const m = mutations();
    renderUsersTable(root, opts({ mutations: m, editMode: true }));
    click(root.querySelector('tr.user-row'));
    click(root.querySelector('[data-action="toggle-hats"]'));
    expect(root.textContent).toContain('Flat Cap');
    expect(root.textContent).toContain('Beanie');
    click(root.querySelector('[data-action="remove-hat"]'));
    await Promise.resolve(); await Promise.resolve();
    expect(m.removeHat).toHaveBeenCalled();
    expect(root.textContent).toContain('Flat Cap');
    expect(root.textContent).not.toContain('Beanie');
  });

  it('does not remove a hat when confirm returns false', async () => {
    const m = mutations();
    renderUsersTable(root, opts({ mutations: m, editMode: true, confirmFn: () => false }));
    click(root.querySelector('tr.user-row'));
    click(root.querySelector('[data-action="toggle-hats"]'));
    click(root.querySelector('[data-action="remove-hat"]'));
    await Promise.resolve();
    expect(m.removeHat).not.toHaveBeenCalled();
  });

  it('deletes a horse and removes its card', async () => {
    const m = mutations();
    renderUsersTable(root, opts({ mutations: m, editMode: true }));
    click(root.querySelector('tr.user-row'));
    click(root.querySelector('[data-action="delete-horse"]'));
    await Promise.resolve(); await Promise.resolve();
    expect(m.deleteHorse).toHaveBeenCalledWith('u1', 'h1');
    expect(root.textContent).not.toContain('Thunderbolt');
  });

  it('calls onUnauthorized when a mutation 401s', async () => {
    const onUnauthorized = vi.fn();
    const m = mutations({ deleteHorse: vi.fn(async () => { throw { status: 401 }; }) });
    renderUsersTable(root, opts({ mutations: m, editMode: true, onUnauthorized }));
    click(root.querySelector('tr.user-row'));
    click(root.querySelector('[data-action="delete-horse"]'));
    await Promise.resolve(); await Promise.resolve();
    expect(onUnauthorized).toHaveBeenCalled();
  });

  it('ignores overlapping mutations while one is in flight', async () => {
    let release: () => void = () => {};
    const deleteHorse = vi.fn(() => new Promise<void>((r) => { release = r; }));
    const m = mutations({ deleteHorse });
    renderUsersTable(root, opts({ mutations: m, editMode: true }));
    click(root.querySelector('tr.user-row'));
    click(root.querySelector('[data-action="delete-horse"]'));   // in flight
    click(root.querySelector('[data-action="delete-horse"]'));   // ignored (busy)
    await Promise.resolve();
    expect(deleteHorse).toHaveBeenCalledTimes(1);
    release(); await Promise.resolve(); await Promise.resolve();
  });

  it('renames a horse via the inline input', async () => {
    const m = mutations();
    renderUsersTable(root, opts({ mutations: m, editMode: true }));
    click(root.querySelector('tr.user-row'));
    click(root.querySelector('[data-action="edit-horse-name"]'));
    (root.querySelector('[data-edit-input]') as HTMLInputElement).value = 'Renamed';
    click(root.querySelector('[data-action="save-horse-name"]'));
    await Promise.resolve(); await Promise.resolve();
    expect(m.renameHorse).toHaveBeenCalledWith('u1', 'h1', 'Renamed');
    expect(root.textContent).toContain('Renamed');
  });

  it('cancel-edit closes the input without mutating', () => {
    const m = mutations();
    renderUsersTable(root, opts({ mutations: m, editMode: true }));
    click(root.querySelector('tr.user-row'));
    click(root.querySelector('[data-action="edit-user-name"]'));
    expect(root.querySelector('[data-edit-input]')).toBeTruthy();
    click(root.querySelector('[data-action="cancel-edit"]'));
    expect(root.querySelector('[data-edit-input]')).toBeNull();
    expect(m.renameUser).not.toHaveBeenCalled();
  });
});
