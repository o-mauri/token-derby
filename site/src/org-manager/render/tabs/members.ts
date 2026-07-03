import type { OrgMembersResponse } from '@token-derby/shared';
import { esc } from '../../../esc.js';

export type MembersDeps = { members: OrgMembersResponse['members'] };

export function renderMembers(root: HTMLElement, deps: MembersDeps): void {
  const rows = deps.members.map((m) =>
    `<tr><td>${esc(m.user_name)}</td><td class="muted">${esc(m.joined_at.slice(0, 10))}</td></tr>`
  ).join('');
  root.innerHTML = `
    <div class="org-panel">
      <table class="org-table"><thead><tr><th>Member</th><th>Joined</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="2" class="muted">No members.</td></tr>'}</tbody></table>
    </div>
  `;
}
