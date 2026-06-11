import type {
  AdminUsersResponse, AdminOrgsResponse, AdminUser, AdminOrg,
} from '@token-derby/shared';
import { formatTokens, avgFinish } from '../format.js';

export type DashboardDeps = {
  fetchUsers: () => Promise<AdminUsersResponse>;
  fetchOrganisations: () => Promise<AdminOrgsResponse>;
  onSignOut: () => void;
  onUnauthorized: () => void;
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function buildHorsesRow(user: AdminUser): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = 'horses-row';
  const cards = user.horses.map((h) => {
    const hats = h.hats?.length
      ? `<span class="hats">🎩 ${h.hats.length} hat${h.hats.length > 1 ? 's' : ''}</span>`
      : `<span class="hats muted">no hats</span>`;
    return `
      <div class="hcard">
        <span class="swatch" style="background:${esc(h.colors.body)}"></span>
        <span class="hname">${esc(h.name)}</span>
        <div class="hstats">
          <span class="chip">RACES <b>${h.races_entered ?? 0}</b></span>
          <span class="chip">WINS <b>${h.wins ?? 0}</b></span>
          <span class="chip">PODIUMS <b>${h.podiums ?? 0}</b></span>
          <span class="chip">TOKENS <b>${formatTokens(h.total_tokens)}</b></span>
          <span class="chip">AVG FIN <b>${avgFinish(h.total_finishing_position, h.races_entered)}</b></span>
          <span class="chip">XP <b>${h.xp ?? 0}</b></span>
          ${hats}
        </div>
      </div>`;
  }).join('');
  tr.innerHTML = `<td class="horses-cell" colspan="8"><div class="horses">${cards || '<span class="muted" style="padding:12px 16px;display:block">No horses.</span>'}</div></td>`;
  return tr;
}

function userRowHtml(u: AdminUser): string {
  const wins = u.horses.reduce((s, h) => s + (h.wins ?? 0), 0);
  const races = u.horses.reduce((s, h) => s + (h.races_entered ?? 0), 0);
  const podiums = u.horses.reduce((s, h) => s + (h.podiums ?? 0), 0);
  const xp = u.horses.reduce((s, h) => s + (h.xp ?? 0), 0);
  return `
    <tr class="user-row">
      <td><span class="caret">▸</span></td>
      <td>${esc(u.display_name)}</td>
      <td>${u.horses.length}</td>
      <td>${races}</td>
      <td class="win">${wins}</td>
      <td>${podiums}</td>
      <td>${xp.toLocaleString()}</td>
      <td class="muted">${esc(u.created_at.slice(0, 10))}</td>
    </tr>`;
}

function orgRowHtml(o: AdminOrg): string {
  const names = o.members.map((m) => esc(m.user_name)).join(', ');
  return `
    <tr>
      <td>${esc(o.org_name)}</td>
      <td class="muted">${names} <span style="opacity:.6">(${o.members.length})</span></td>
      <td>${esc(o.creator_user_name)}</td>
      <td class="muted">${esc(o.created_at.slice(0, 10))}</td>
    </tr>`;
}

export function renderDashboard(root: HTMLElement, deps: DashboardDeps): void {
  root.innerHTML = `
    <div class="wrap">
      <div class="topbar">
        <h1>🏇 TOKEN DERBY · ADMIN</h1>
        <div class="who">signed in <button type="button" class="signout">sign out</button></div>
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

  void (async () => {
    try {
      const { users } = await deps.fetchUsers();
      const usersCount = root.querySelector('#users-section .count');
      const body = root.querySelector('#users-body');
      if (!usersCount || !body) return;
      usersCount.textContent = `· ${users.length} total`;
      body.innerHTML = `
        <table>
          <thead><tr><th style="width:34px"></th><th>Jockey</th><th>Horses</th><th>Races</th><th>Wins</th><th>Podiums</th><th>XP</th><th>Joined</th></tr></thead>
          <tbody>${users.map(userRowHtml).join('')}</tbody>
        </table>`;
      body.querySelectorAll<HTMLElement>('tr.user-row').forEach((row, idx) => {
        let expanded = false;
        let horsesRow: HTMLTableRowElement | null = null;
        row.addEventListener('click', () => {
          expanded = !expanded;
          if (expanded) {
            horsesRow = buildHorsesRow(users[idx]);
            row.insertAdjacentElement('afterend', horsesRow);
          } else {
            horsesRow?.remove();
            horsesRow = null;
          }
          row.querySelector('.caret')!.textContent = expanded ? '▾' : '▸';
        });
      });
    } catch (e) {
      if (unauthorized(e)) return;
      const usersBody = root.querySelector('#users-body');
      if (usersBody) usersBody.innerHTML = `<p class="muted">Failed to load users.</p>`;
    }
  })();

  void (async () => {
    try {
      const { organisations } = await deps.fetchOrganisations();
      const orgsCount = root.querySelector('#orgs-section .count');
      const orgsBody = root.querySelector('#orgs-body');
      if (!orgsCount || !orgsBody) return;
      orgsCount.textContent = `· ${organisations.length} total`;
      orgsBody.innerHTML = `
        <table>
          <thead><tr><th>Organisation</th><th>Members</th><th>Created by</th><th>Created</th></tr></thead>
          <tbody>${organisations.map(orgRowHtml).join('')}</tbody>
        </table>`;
    } catch (e) {
      if (unauthorized(e)) return;
      const orgsBody = root.querySelector('#orgs-body');
      if (orgsBody) orgsBody.innerHTML = `<p class="muted">Failed to load organisations.</p>`;
    }
  })();
}
