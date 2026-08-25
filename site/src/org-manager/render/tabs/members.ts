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
  /** Changes what the confirmation can promise about shutting someone out:
   *  with domain auto-join on, rotating the token does not. */
  domainJoinEnabled?: boolean;
  onRemove?: (userId: string) => void;
};

// Removal is not blocking: it says so, plainly, so nobody reads this as
// permanent. What actually happens, in the order it happens:
//   - immediate loss of creating and joining races, and of the member list
//   - standings and past results stay readable: those pages need no membership
//   - the horse does not carry into next season
//   - rejoining is still open, and with domain auto-join on the token is not
//     the lever that stops it
function removeConfirm(name: string, domainJoinEnabled: boolean): string {
  const rejoin = domainJoinEnabled
    ? `They can rejoin at once with no token at all — this organisation admits anyone with a matching email domain. `
      + `Turn that off on the Access tab first if you mean to keep them out.`
    : `They can rejoin with the join token unless you also rotate it or turn joining off.`;
  return `Remove ${name} from this organisation?\n\n`
    + `They lose access to creating and joining this organisation's races immediately. `
    + `Standings and past results stay visible to them — those races happened — `
    + `but their horse will not be carried into next season.\n\n`
    + rejoin;
}

// Both cells are owner-only columns: the server omits `linked_email` and
// `matches_domain` from a non-owner's response entirely, so these render only
// off the `isOwner` flag the caller already gates the Remove column on —
// never off whether the fields happen to be present.
function linkedCell(linked: boolean | undefined): string {
  return linked
    ? `<td class="org-tick" title="Has a verified Google account linked">&#10003;</td>`
    : `<td class="org-cross" title="No verified Google account linked">&#10007;</td>`;
}

function domainCell(state: 'yes' | 'no' | 'n/a' | undefined): string {
  if (state === 'yes') return `<td class="org-tick" title="A proven domain matches this org's allow-list">&#10003;</td>`;
  if (state === 'no') return `<td class="org-cross" title="No proven domain matches this org's allow-list">&#10007;</td>`;
  return `<td class="org-na" title="Not applicable — no allow-list, or no linked email to compare">&mdash;</td>`;
}

export function renderMembers(root: HTMLElement, deps: MembersDeps): void {
  const isOwner = deps.isOwner === true;
  const rows = deps.members.map((m) => {
    const canRemove = isOwner && m.user_id !== deps.ownerUserId;
    const linkageCells = isOwner ? `${linkedCell(m.linked_email)}${domainCell(m.matches_domain)}` : '';
    const actionCell = isOwner
      ? `<td>${canRemove ? `<button type="button" class="org-member-remove" data-user="${esc(m.user_id)}" data-name="${esc(m.user_name)}">Remove</button>` : ''}</td>`
      : '';
    return `<tr><td>${esc(m.user_name)}</td><td class="muted">${esc(m.joined_at.slice(0, 10))}</td>${linkageCells}${actionCell}</tr>`;
  }).join('');

  const ownerHeaders = isOwner ? '<th>Linked email</th><th>Matches domain</th><th></th>' : '';
  root.innerHTML = `
    <div class="org-panel">
      <table class="org-table"><thead><tr><th>Member</th><th>Joined</th>${ownerHeaders}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${isOwner ? 5 : 2}" class="muted">No members.</td></tr>`}</tbody></table>
    </div>
  `;

  if (!isOwner) return;
  root.querySelectorAll<HTMLButtonElement>('.org-member-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const userId = btn.dataset.user!;
      const name = btn.dataset.name!;
      if (!confirm(removeConfirm(name, deps.domainJoinEnabled === true))) return;
      deps.onRemove?.(userId);
    });
  });
}
