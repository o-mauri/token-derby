import type { OrgMembersResponse } from '@token-derby/shared';
import { esc } from '../../../esc.js';

export type MembersDeps = {
  members: OrgMembersResponse['members'];
  /** Remove is owner-only, and defaults off so a caller that predates removal
   *  (and every existing test built against that shape) still renders exactly
   *  the plain read-only table it always did. */
  isOwner?: boolean;
  /** The creator's user_id — never offered a Remove button; the server refuses
   *  it too (CANNOT_REMOVE_OWNER), but the control should not dangle here. */
  ownerUserId?: string;
  onRemove?: (userId: string) => void;
};

// Removal is not blocking: it says so, plainly, so nobody reads this as
// permanent. What actually happens, in the order it happens:
//   - immediate loss of access to races and standings
//   - past results are untouched — those races already happened
//   - the horse does not carry into next season
//   - rejoining is still open, unless the token is also rotated or turned off
function removeConfirm(name: string): string {
  return `Remove ${name} from this organisation?\n\n`
    + `They lose access to races and standings immediately. Their past results stay — those races happened — `
    + `but their horse will not be carried into next season.\n\n`
    + `They can rejoin with the join token unless you also rotate it or turn joining off.`;
}

export function renderMembers(root: HTMLElement, deps: MembersDeps): void {
  const isOwner = deps.isOwner === true;
  const rows = deps.members.map((m) => {
    const canRemove = isOwner && m.user_id !== deps.ownerUserId;
    const actionCell = isOwner
      ? `<td>${canRemove ? `<button type="button" class="org-member-remove" data-user="${esc(m.user_id)}" data-name="${esc(m.user_name)}">Remove</button>` : ''}</td>`
      : '';
    return `<tr><td>${esc(m.user_name)}</td><td class="muted">${esc(m.joined_at.slice(0, 10))}</td>${actionCell}</tr>`;
  }).join('');

  root.innerHTML = `
    <div class="org-panel">
      <table class="org-table"><thead><tr><th>Member</th><th>Joined</th>${isOwner ? '<th></th>' : ''}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${isOwner ? 3 : 2}" class="muted">No members.</td></tr>`}</tbody></table>
    </div>
  `;

  if (!isOwner) return;
  root.querySelectorAll<HTMLButtonElement>('.org-member-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const userId = btn.dataset.user!;
      const name = btn.dataset.name!;
      if (!confirm(removeConfirm(name))) return;
      deps.onRemove?.(userId);
    });
  });
}
