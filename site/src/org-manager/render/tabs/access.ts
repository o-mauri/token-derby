import type { OrgAccessSettings } from '@token-derby/shared';
import { esc } from '../../../esc.js';

export type AccessDeps = {
  access: OrgAccessSettings;
  /** The freshly rotated token, shown once right after a successful rotation. */
  rotatedToken?: string | null;
  onSave: (settings: OrgAccessSettings) => void;
  onRotate: () => void;
};

// Rotation has no undo: whoever is holding the old token — a current member
// mid-onboarding, a removed member trying to walk back in, anyone — loses it
// the moment this succeeds. Said plainly rather than hinted at.
const ROTATE_CONFIRM =
  'Rotate the join token? This invalidates the current token for everyone — anyone who has it, ' +
  'including current members, will need the new one to join.';

function parseDomains(raw: string): string[] {
  return raw.split(/[\n,]/).map((d) => d.trim()).filter((d) => d.length > 0);
}

export function renderAccess(root: HTMLElement, deps: AccessDeps): void {
  const a = deps.access;
  const rotatedBlock = deps.rotatedToken
    ? `<div class="org-secret"><span class="label">NEW JOIN TOKEN (shown once here)</span><code>${esc(deps.rotatedToken)}</code></div>`
    : '';

  root.innerHTML = `
    <div class="org-panel org-access">
      <label class="label org-access-toggle">
        <input type="checkbox" data-field="join_token_enabled" ${a.join_token_enabled ? 'checked' : ''}>
        Let anyone join with the shared join token
      </label>

      <label class="label org-access-toggle">
        <input type="checkbox" data-field="domain_join_enabled" ${a.domain_join_enabled ? 'checked' : ''}>
        Automatically let people with a matching email domain join — no token needed
      </label>

      <label class="label">Domains
        <textarea data-field="allowed_domains" rows="4" placeholder="acme.com">${esc(a.allowed_domains.join('\n'))}</textarea>
      </label>
      <div class="org-actions">
        <button type="button" class="org-btn" data-action="save-domains">Save domains</button>
      </div>

      <label class="label org-access-toggle">
        <input type="checkbox" data-field="restrict_to_allowed_domains" ${a.restrict_to_allowed_domains ? 'checked' : ''}>
        Require every route — including the join token — to match one of the domains above
      </label>
      <p class="muted">With this on, the join token alone is not enough: anyone joining, token or not, must match an allowed domain.</p>

      <div class="org-access-rotate">
        <span class="label">JOIN TOKEN ROTATION</span>
        <p class="muted">The join token is visible to every member, not just you — rotating is how you shut out someone you've removed who still has it.</p>
        <div class="org-actions"><button type="button" class="org-btn" data-action="rotate">Rotate join token</button></div>
        ${rotatedBlock}
      </div>
    </div>
  `;

  const currentSettings = (): OrgAccessSettings => ({
    join_token_enabled: root.querySelector<HTMLInputElement>('[data-field="join_token_enabled"]')!.checked,
    domain_join_enabled: root.querySelector<HTMLInputElement>('[data-field="domain_join_enabled"]')!.checked,
    restrict_to_allowed_domains: root.querySelector<HTMLInputElement>('[data-field="restrict_to_allowed_domains"]')!.checked,
    allowed_domains: parseDomains(root.querySelector<HTMLTextAreaElement>('[data-field="allowed_domains"]')!.value),
  });

  (['join_token_enabled', 'domain_join_enabled', 'restrict_to_allowed_domains'] as const).forEach((field) => {
    root.querySelector(`[data-field="${field}"]`)!.addEventListener('change', () => deps.onSave(currentSettings()));
  });
  root.querySelector('[data-action="save-domains"]')!.addEventListener('click', () => deps.onSave(currentSettings()));

  root.querySelector('[data-action="rotate"]')!.addEventListener('click', () => {
    if (!confirm(ROTATE_CONFIRM)) return;
    deps.onRotate();
  });
}
