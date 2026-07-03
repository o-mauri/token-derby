import type { GetOrganisationResponse } from '@token-derby/shared';
import { esc } from '../../../esc.js';

export type OverviewDeps = { org: GetOrganisationResponse };

export function renderOverview(root: HTMLElement, deps: OverviewDeps): void {
  const o = deps.org;
  root.innerHTML = `
    <div class="org-panel">
      <div class="org-field"><span class="label">NAME</span> ${esc(o.org_name)}</div>
      <div class="org-field"><span class="label">CREATED</span> ${esc(o.created_at.slice(0, 10))} · by ${esc(o.creator_user_name)}</div>
      <div class="org-field">
        <span class="label">JOIN TOKEN — treat as a secret</span>
        <code class="org-token">${esc(o.org_join_token)}</code>
        <button type="button" class="org-copy" data-token="${esc(o.org_join_token)}">copy</button>
        <p class="warn">⚠ Anyone with this token can join your organisation.</p>
      </div>
    </div>
  `;
  root.querySelector<HTMLElement>('.org-copy')!.addEventListener('click', (e) => {
    const t = (e.currentTarget as HTMLElement).dataset.token!;
    void navigator.clipboard?.writeText(t);
  });
}
