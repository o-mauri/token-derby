import type { DeviceRecord } from '@token-derby/shared';
import { esc } from '../../esc.js';

export type AccountDeps = {
  email: string | null;
  devices: DeviceRecord[];
  /** Whether the account still has the original account-level CLI credential,
   *  which is not one of `devices` and is unaffected by revoking any of them. */
  hasLegacyCredential: boolean;
  onRevoke: (deviceId: string) => void;
};

// Revoking is allowed even for the device you are on right now — there is no
// server-side guard against it — but a web session and a CLI device token are
// different credentials, so this has to say plainly that revoking does not
// sign the browser out, rather than letting the user assume it would.
const REVOKE_CONFIRM =
  "Revoke this device? This only removes its CLI credential — it will not log you out of the web, since your web session is a separate credential.";

function formatTimestamp(iso: string): string {
  // Seconds, not minutes: duplicate labels are allowed, so this is the only
  // visible differentiator between two devices, and several can register
  // within the same minute (a script spinning up CI runners, or a re-run of
  // `token-derby login` right after a mistake).
  return iso.slice(0, 19).replace('T', ' ');
}

// Said plainly rather than hinted at: the table is not the whole set, and
// revoking every row in it does not lock out a machine still holding the old
// identity.json. Nothing here clears that credential — retiring it is a
// separate decision, so the view's job is to stop implying it is already gone.
const LEGACY_NOTE = `
  <p class="org-account-legacy">
    This account also has an original CLI credential from before per-device sign-in.
    It is <strong>not listed above</strong>, and revoking these devices does not affect it &mdash;
    any machine still holding that <code>identity.json</code> keeps full access to your account.
  </p>
`;

function deviceRow(d: DeviceRecord): string {
  return `
    <tr data-device="${esc(d.device_id)}">
      <td class="org-device-label">${esc(d.label)}</td>
      <td class="muted">${esc(formatTimestamp(d.created_at))}</td>
      <td class="muted">${esc(formatTimestamp(d.last_seen_at))}</td>
      <td><button type="button" class="org-device-revoke" data-device="${esc(d.device_id)}">Revoke</button></td>
    </tr>
  `;
}

export function renderAccount(root: HTMLElement, deps: AccountDeps): void {
  const rows = deps.devices.map(deviceRow).join('');
  // Links /cli: the approval page is otherwise unreachable except by retyping
  // a URL from the terminal, and nothing else in the site points at it.
  const emptyRow = '<tr><td colspan="4" class="muted">No devices yet — run <code>token-derby login</code> on a machine and approve it at <a href="/cli">/cli</a> to see it here.</td></tr>';

  root.innerHTML = `
    <div class="org-account">
      <div class="org-panel org-account-email">
        <span class="label">GOOGLE ACCOUNT</span>
        ${deps.email
          ? `<span class="org-account-email-value">${esc(deps.email)}</span>`
          : '<p class="muted">No Google account linked yet.</p>'}
      </div>
      <div class="org-panel org-account-devices">
        <span class="label">DEVICES</span>
        <table class="org-table">
          <thead><tr><th>Label</th><th>Created</th><th>Last seen</th><th></th></tr></thead>
          <tbody>${rows || emptyRow}</tbody>
        </table>
        ${deps.hasLegacyCredential ? LEGACY_NOTE : ''}
      </div>
    </div>
  `;

  root.querySelectorAll<HTMLElement>('.org-device-revoke').forEach((btn) => {
    btn.addEventListener('click', () => {
      const deviceId = btn.dataset.device!;
      if (!confirm(REVOKE_CONFIRM)) return;
      deps.onRevoke(deviceId);
    });
  });
}
