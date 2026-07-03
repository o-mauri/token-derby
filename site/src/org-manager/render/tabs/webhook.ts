import type { GetOrgWebhookResponse } from '@token-derby/shared';
import { esc } from '../../../esc.js';

export type WebhookDeps = {
  webhook: GetOrgWebhookResponse | null;
  isOwner: boolean;
  lastSecret?: string | null; // shown once, right after a save
  onSave: (url: string) => void;
  onClear: () => void;
};

export function renderWebhook(root: HTMLElement, deps: WebhookDeps): void {
  const url = deps.webhook?.webhook_url ?? '';
  const secretBlock = deps.lastSecret
    ? `<div class="org-secret"><span class="label">SECRET (shown once)</span><code>${esc(deps.lastSecret)}</code></div>`
    : '';
  const controls = deps.isOwner
    ? `<div class="org-actions">
         <button type="button" class="org-btn" data-action="save">Save webhook</button>
         <button type="button" class="org-btn" data-action="clear">Clear</button>
       </div>`
    : `<p class="muted">Only the organisation owner can change the webhook.</p>`;

  root.innerHTML = `
    <div class="org-panel">
      <label class="label">HTTPS URL
        <input name="url" value="${esc(url)}" placeholder="https://…" ${deps.isOwner ? '' : 'disabled'}></label>
      ${secretBlock}
      ${controls}
    </div>
  `;

  if (deps.isOwner) {
    root.querySelector('[data-action="save"]')!.addEventListener('click', () => {
      deps.onSave((root.querySelector('input[name="url"]') as HTMLInputElement).value.trim());
    });
    root.querySelector('[data-action="clear"]')!.addEventListener('click', () => deps.onClear());
  }
}
