import type { AdminOrgsResponse, AdminUsersResponse, AdminOrg } from '@token-derby/shared';
import { esc } from '../esc.js';
import { renderUsersTable, type UsersTableMutations, type UsersTableHandle } from './users-table.js';

export type DashboardDeps = {
  fetchUsers: () => Promise<AdminUsersResponse>;
  fetchOrganisations: () => Promise<AdminOrgsResponse>;
  mutations: UsersTableMutations;
  onSignOut: () => void;
  onUnauthorized: () => void;
};

function orgRowHtml(o: AdminOrg): string {
  const names = o.members.map((m) => esc(m.user_name)).join(', ');
  return `<tr><td>${esc(o.org_name)}</td><td class="muted">${names} <span style="opacity:.6">(${o.members.length})</span></td><td>${esc(o.creator_user_name)}</td><td class="muted">${esc(o.created_at.slice(0, 10))}</td></tr>`;
}

export function renderDashboard(root: HTMLElement, deps: DashboardDeps): void {
  root.innerHTML = `
    <div class="wrap">
      <div class="topbar">
        <h1>🏇 TOKEN DERBY · ADMIN</h1>
        <div class="who">
          <button type="button" class="edit-toggle" aria-pressed="false">Edit</button>
          signed in <button type="button" class="signout">sign out</button>
        </div>
      </div>
      <div class="section" id="users-section">
        <h2>Registered users <span class="count">· loading…</span></h2>
        <div id="users-body"></div>
      </div>
      <div class="section" id="orgs-section">
        <h2>Organisations <span class="count"></span></h2>
        <div id="orgs-body"></div>
      </div>
    </div>
  `;

  root.querySelector('.signout')!.addEventListener('click', () => deps.onSignOut());

  let unauthorizedHandled = false;
  const unauthorized = (e: unknown) => {
    if (e && typeof e === 'object' && (e as { status?: number }).status === 401) {
      if (!unauthorizedHandled) { unauthorizedHandled = true; deps.onUnauthorized(); }
      return true;
    }
    return false;
  };

  let tableHandle: UsersTableHandle | null = null;
  let editMode = false;
  const editBtn = root.querySelector<HTMLButtonElement>('.edit-toggle')!;
  editBtn.addEventListener('click', () => {
    editMode = !editMode;
    editBtn.setAttribute('aria-pressed', String(editMode));
    editBtn.textContent = editMode ? 'Done' : 'Edit';
    tableHandle?.setEditMode(editMode);
  });

  void (async () => {
    try {
      const { users } = await deps.fetchUsers();
      const count = root.querySelector('#users-section .count');
      const body = root.querySelector<HTMLElement>('#users-body');
      if (!count || !body) return;
      count.textContent = `· ${users.length} total`;
      tableHandle = renderUsersTable(body, {
        users,
        editMode,
        mutations: deps.mutations,
        onUnauthorized: () => { unauthorized({ status: 401 }); },
      });
    } catch (e) {
      if (unauthorized(e)) return;
      const body = root.querySelector('#users-body');
      if (body) body.innerHTML = `<p class="muted">Failed to load users.</p>`;
    }
  })();

  void (async () => {
    try {
      const { organisations } = await deps.fetchOrganisations();
      const count = root.querySelector('#orgs-section .count');
      const body = root.querySelector('#orgs-body');
      if (!count || !body) return;
      count.textContent = `· ${organisations.length} total`;
      body.innerHTML = `<table><thead><tr><th>Organisation</th><th>Members</th><th>Created by</th><th>Created</th></tr></thead><tbody>${organisations.map(orgRowHtml).join('')}</tbody></table>`;
    } catch (e) {
      if (unauthorized(e)) return;
      const body = root.querySelector('#orgs-body');
      if (body) body.innerHTML = `<p class="muted">Failed to load organisations.</p>`;
    }
  })();
}
