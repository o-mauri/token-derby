import type { DeviceRecord } from '@token-derby/shared';
import { esc } from '../../esc.js';

export type AccountDeps = {
  email: string | null;
  devices: DeviceRecord[];
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
  const emptyRow = '<tr><td colspan="4" class="muted">No devices yet — run `token-derby login` on a machine to see it here.</td></tr>';

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
