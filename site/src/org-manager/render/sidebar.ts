import type { OrganisationSummary } from '@token-derby/shared';
import { esc } from '../../esc.js';

/** Which part of the sidebar is highlighted as current. 'account' replaces
 *  the org tabs in the main area rather than being one of them — see
 *  render/account.ts and index.ts's drawMain. */
export type SidebarView = 'org' | 'account';

export type SidebarDeps = {
  orgs: OrganisationSummary[];
  selected: string | null;
  ownerOrgs: Set<string>;
  linkedEmail: string | null;
  onSelect: (orgName: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onLinkGoogle: () => void;
  onLogout: () => void;
  /** Optional for backward compatibility with older call sites; real callers
   *  should always pass both so the Account entry is reachable and clickable. */
  view?: SidebarView;
  onAccount?: () => void;
};

export function renderSidebar(root: HTMLElement, deps: SidebarDeps): void {
  const view = deps.view ?? 'org';
  const rows = deps.orgs.map((o) => {
    const pill = deps.ownerOrgs.has(o.org_name) ? 'owner' : 'member';
    const sel = view === 'org' && o.org_name === deps.selected ? ' selected' : '';
    return `<div class="org-row${sel}" data-org="${esc(o.org_name)}">${esc(o.org_name)} <span class="pill">${pill}</span></div>`;
  }).join('');
  const accountSel = view === 'account' ? ' selected' : '';

  root.innerHTML = `
    <aside class="org-sidebar">
      <button type="button" class="org-row org-account-row${accountSel}">Account</button>
      <div class="org-side-head">YOUR ORGS <button type="button" class="org-logout">logout</button></div>
      <div class="org-list">${rows || '<p class="muted">No organisations yet.</p>'}</div>
      <div class="org-actions">
        <button type="button" class="org-create">+ Create</button>
        <button type="button" class="org-join">Join with token</button>
        ${deps.linkedEmail
          ? `<div class="org-linked-email muted">Linked: ${esc(deps.linkedEmail)}</div>`
          : `<button type="button" class="org-link-google">Link Google account</button>`}
      </div>
    </aside>
  `;

  root.querySelectorAll<HTMLElement>('.org-row[data-org]').forEach((el) => {
    el.addEventListener('click', () => deps.onSelect(el.dataset.org!));
  });
  root.querySelector('.org-account-row')!.addEventListener('click', () => deps.onAccount?.());
  root.querySelector('.org-create')!.addEventListener('click', () => deps.onCreate());
  root.querySelector('.org-join')!.addEventListener('click', () => deps.onJoin());
  root.querySelector('.org-link-google')?.addEventListener('click', () => deps.onLinkGoogle());
  root.querySelector('.org-logout')!.addEventListener('click', () => deps.onLogout());
}
