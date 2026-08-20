import type { OrganisationSummary } from '@token-derby/shared';
import { esc } from '../../esc.js';

export type SidebarDeps = {
  orgs: OrganisationSummary[];
  selected: string | null;
  ownerOrgs: Set<string>;
  onSelect: (orgName: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onLinkGoogle: () => void;
  onLogout: () => void;
};

export function renderSidebar(root: HTMLElement, deps: SidebarDeps): void {
  const rows = deps.orgs.map((o) => {
    const pill = deps.ownerOrgs.has(o.org_name) ? 'owner' : 'member';
    const sel = o.org_name === deps.selected ? ' selected' : '';
    return `<div class="org-row${sel}" data-org="${esc(o.org_name)}">${esc(o.org_name)} <span class="pill">${pill}</span></div>`;
  }).join('');

  root.innerHTML = `
    <aside class="org-sidebar">
      <div class="org-side-head">YOUR ORGS <button type="button" class="org-logout">logout</button></div>
      <div class="org-list">${rows || '<p class="muted">No organisations yet.</p>'}</div>
      <div class="org-actions">
        <button type="button" class="org-create">+ Create</button>
        <button type="button" class="org-join">Join with token</button>
        <button type="button" class="org-link-google">Link Google account</button>
      </div>
    </aside>
  `;

  root.querySelectorAll<HTMLElement>('.org-row').forEach((el) => {
    el.addEventListener('click', () => deps.onSelect(el.dataset.org!));
  });
  root.querySelector('.org-create')!.addEventListener('click', () => deps.onCreate());
  root.querySelector('.org-join')!.addEventListener('click', () => deps.onJoin());
  root.querySelector('.org-link-google')!.addEventListener('click', () => deps.onLinkGoogle());
  root.querySelector('.org-logout')!.addEventListener('click', () => deps.onLogout());
}
