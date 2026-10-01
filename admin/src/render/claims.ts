import {
  HATS, hatById, isAnimatedHat, formatClaimCode, DEFAULT_CLAIM_EXPIRY_DAYS, MAX_CLAIM_REDEMPTIONS,
} from '@token-derby/shared';
import type {
  AdminClaim, AdminClaimsResponse, AdminClaimRedemption, AdminClaimRedemptionsResponse,
  ClaimEntry, CreateClaimRequest, CreateClaimResponse, Hat, VariantHat,
} from '@token-derby/shared';
import { esc } from '../esc.js';

export type ClaimsDeps = {
  fetchClaims: () => Promise<AdminClaimsResponse>;
  createClaim: (body: CreateClaimRequest) => Promise<CreateClaimResponse>;
  fetchRedemptions: (code: string) => Promise<AdminClaimRedemptionsResponse>;
  onUnauthorized: () => void;
};

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary', 'limited'] as const;

function grouped(): string {
  return RARITY_ORDER.map(rarity => {
    const hats = HATS.filter(h => h.rarity === rarity);
    if (hats.length === 0) return '';
    const opts = hats.map(h =>
      `<option value="${esc(h.id)}">${esc(h.name)}${h.rollable ? '' : ' (exclusive)'}</option>`,
    ).join('');
    return `<optgroup label="${esc(rarity)}">${opts}</optgroup>`;
  }).join('');
}

function entryRowHtml(): string {
  return `<div class="claim-entry">
    <select class="claim-hat">${grouped()}</select>
    <select class="claim-variant"></select>
    <button type="button" class="claim-entry-remove" aria-label="Remove hat">×</button>
  </div>`;
}

function entrySummary(c: AdminClaim): string {
  if (c.entries.length !== 1) return `Pack of ${c.entries.length}`;
  const entry = c.entries[0]!;
  const hat = hatById(entry.hat_id);
  if (!hat) return entry.hat_id;
  return entry.variant !== undefined ? `${hat.name} #${entry.variant + 1}` : hat.name;
}

function statusOf(c: AdminClaim): string {
  if (c.redeemed_count >= c.max_redemptions) return `${c.redeemed_count} / ${c.max_redemptions} · spent`;
  if (Date.parse(c.expires_at) <= Date.now()) return `${c.redeemed_count} / ${c.max_redemptions} · expired`;
  return `${c.redeemed_count} / ${c.max_redemptions} redeemed`;
}

function rowHtml(c: AdminClaim): string {
  return `<tr data-code="${esc(c.code)}">
    <td><code>${esc(formatClaimCode(c.code))}</code></td>
    <td>${esc(entrySummary(c))}</td>
    <td class="muted">${esc(c.created_at.slice(0, 10))}</td>
    <td class="muted">${esc(c.expires_at.slice(0, 10))}</td>
    <td>${esc(statusOf(c))}${c.redeemed_count > 0 ? ' <button type="button" class="claim-drill">who?</button>' : ''}</td>
  </tr>`;
}

export function renderClaims(root: HTMLElement, deps: ClaimsDeps): void {
  root.innerHTML = `
    <form class="claim-form" autocomplete="off">
      <div class="claim-entries"></div>
      <button type="button" class="claim-entry-add">+ Add hat</button>
      <div class="claim-controls">
        <label>Max claims <input class="claim-max" type="number" min="1" max="${MAX_CLAIM_REDEMPTIONS}" value="1"></label>
        <label>Expires (days) <input class="claim-days" type="number" min="1" max="365" value="${DEFAULT_CLAIM_EXPIRY_DAYS}"></label>
        <button type="button" class="claim-generate">Generate</button>
      </div>
    </form>
    <div class="claim-result" hidden>
      <label>Claim token <input class="claim-code" readonly></label>
      <button type="button" class="claim-copy">Copy</button>
      <p class="muted">Shown once. Send it to the player — anyone holding it can redeem it.</p>
    </div>
    <div class="claim-list"><p class="muted">loading…</p></div>
  `;

  const formEl = root.querySelector<HTMLFormElement>('.claim-form')!;
  formEl.addEventListener('submit', (e) => e.preventDefault());

  const daysEl = root.querySelector<HTMLInputElement>('.claim-days')!;
  const resultEl = root.querySelector<HTMLElement>('.claim-result')!;
  const codeEl = root.querySelector<HTMLInputElement>('.claim-code')!;
  const listEl = root.querySelector<HTMLElement>('.claim-list')!;
  const entriesEl = root.querySelector<HTMLElement>('.claim-entries')!;

  const syncRow = (row: HTMLElement) => {
    const hat: Hat | undefined = hatById(row.querySelector<HTMLSelectElement>('.claim-hat')!.value);
    const variantSel = row.querySelector<HTMLSelectElement>('.claim-variant')!;
    const animated = !hat || isAnimatedHat(hat);
    variantSel.hidden = animated;
    variantSel.innerHTML = animated ? '' : [
      '<option value="">Any</option>',
      ...(hat as VariantHat).variants.map((_, i) => `<option value="${i}">#${i + 1}</option>`),
    ].join('');
  };

  const addRow = () => {
    entriesEl.insertAdjacentHTML('beforeend', entryRowHtml());
    const row = entriesEl.lastElementChild as HTMLElement;
    row.querySelector<HTMLSelectElement>('.claim-hat')!.addEventListener('change', () => syncRow(row));
    row.querySelector<HTMLButtonElement>('.claim-entry-remove')!.addEventListener('click', () => {
      // The form is meaningless with no hats, so the last row is permanent.
      if (entriesEl.querySelectorAll('.claim-entry').length > 1) row.remove();
    });
    syncRow(row);
  };

  addRow();
  root.querySelector<HTMLButtonElement>('.claim-entry-add')!.addEventListener('click', addRow);

  const unauthorized = (e: unknown) => {
    if (e && typeof e === 'object' && (e as { status?: number }).status === 401) {
      deps.onUnauthorized();
      return true;
    }
    return false;
  };

  const loadList = async () => {
    try {
      const { claims } = await deps.fetchClaims();
      listEl.innerHTML = claims.length === 0
        ? `<p class="muted">No claim tokens yet.</p>`
        : `<table><thead><tr><th>Token</th><th>Hat</th><th>Created</th><th>Expires</th><th>Status</th></tr></thead><tbody>${claims.map(rowHtml).join('')}</tbody></table>`;
    } catch (e) {
      if (unauthorized(e)) return;
      listEl.innerHTML = `<p class="muted">Failed to load claim tokens.</p>`;
    }
  };

  const redemptionRow = (r: AdminClaimRedemption): string => {
    const who = r.user_name ?? r.user_id;
    const horse = r.horse_name ?? r.horse_id;
    const hat = hatById(r.hat_id);
    const hatLabel = hat
      ? (r.variant !== undefined && !isAnimatedHat(hat) ? `${hat.name} #${r.variant + 1}` : hat.name)
      : r.hat_id;
    const what = r.outcome === 'duplicate'
      ? `duplicate ${esc(hatLabel)} · +${r.xp_awarded ?? 0} XP`
      : esc(hatLabel);
    return `<li>${esc(who)} on ${esc(horse)} — ${what} <span class="muted">${esc(r.redeemed_at.slice(0, 10))}</span></li>`;
  };

  listEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.claim-drill');
    if (!btn) return;
    const tr = btn.closest('tr') as HTMLTableRowElement;
    const existing = tr.nextElementSibling;
    // Second click collapses, so the tally stays readable on a long list.
    if (existing?.classList.contains('claim-detail')) { existing.remove(); return; }
    void (async () => {
      try {
        const { redemptions } = await deps.fetchRedemptions(tr.dataset.code!);
        tr.insertAdjacentHTML('afterend',
          `<tr class="claim-detail"><td colspan="5"><ul>${redemptions.map(redemptionRow).join('')}</ul></td></tr>`);
      } catch (err) {
        if (unauthorized(err)) return;
        tr.insertAdjacentHTML('afterend',
          `<tr class="claim-detail"><td colspan="5" class="muted">Could not load redemptions.</td></tr>`);
      }
    })();
  });

  const generateBtn = root.querySelector<HTMLButtonElement>('.claim-generate')!;
  generateBtn.addEventListener('click', () => {
    void (async () => {
      generateBtn.setAttribute('disabled', 'true');
      try {
        const entries: ClaimEntry[] = Array.from(entriesEl.querySelectorAll<HTMLElement>('.claim-entry')).map(row => {
          const hat_id = row.querySelector<HTMLSelectElement>('.claim-hat')!.value;
          const raw = row.querySelector<HTMLSelectElement>('.claim-variant')!.value;
          return raw === '' ? { hat_id } : { hat_id, variant: Number(raw) };
        });
        const body: CreateClaimRequest = {
          item_type: 'hat',
          entries,
          max_redemptions: Number(root.querySelector<HTMLInputElement>('.claim-max')!.value),
          expires_in_days: Number(daysEl.value),
        };
        try {
          const created = await deps.createClaim(body);
          codeEl.value = formatClaimCode(created.code);
          resultEl.hidden = false;
          await loadList();
        } catch (e) {
          if (unauthorized(e)) return;
          listEl.innerHTML = `<p class="muted">Could not generate a token: ${esc((e as Error)?.message ?? 'unknown error')}</p>`;
        }
      } finally {
        generateBtn.removeAttribute('disabled');
      }
    })();
  });

  root.querySelector<HTMLButtonElement>('.claim-copy')!.addEventListener('click', () => {
    codeEl.select();
    void navigator.clipboard?.writeText(codeEl.value);
  });

  void loadList();
}
