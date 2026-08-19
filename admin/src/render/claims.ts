import { HATS, hatById, formatClaimCode, DEFAULT_CLAIM_EXPIRY_DAYS } from '@token-derby/shared';
import type {
  AdminClaim, AdminClaimsResponse, CreateClaimRequest, CreateClaimResponse, Hat,
} from '@token-derby/shared';
import { esc } from '../esc.js';

export type ClaimsDeps = {
  fetchClaims: () => Promise<AdminClaimsResponse>;
  createClaim: (body: CreateClaimRequest) => Promise<CreateClaimResponse>;
  onUnauthorized: () => void;
};

const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'] as const;

function grouped(): string {
  return RARITY_ORDER.map(rarity => {
    const hats = HATS.filter(h => h.rarity === rarity);
    const opts = hats.map(h =>
      `<option value="${esc(h.id)}">${esc(h.name)}${h.rollable ? '' : ' (exclusive)'}</option>`,
    ).join('');
    return `<optgroup label="${esc(rarity)}">${opts}</optgroup>`;
  }).join('');
}

function statusOf(c: AdminClaim): string {
  if (c.redeemed_at) {
    const who = c.redeemed_by_name ?? c.redeemed_by ?? 'someone';
    const horse = c.redeemed_horse_name ?? c.redeemed_horse_id ?? 'a horse';
    return `redeemed by ${esc(who)} on ${esc(horse)}`;
  }
  if (Date.parse(c.expires_at) <= Date.now()) return 'expired';
  return 'outstanding';
}

function rowHtml(c: AdminClaim): string {
  const hat = hatById(c.hat_id);
  const variantSuffix = c.variant !== undefined ? ` #${c.variant + 1}` : '';
  const name = hat ? `${hat.name}${variantSuffix}` : c.hat_id;
  return `<tr>
    <td><code>${esc(formatClaimCode(c.code))}</code></td>
    <td>${esc(name)}</td>
    <td class="muted">${esc(c.created_at.slice(0, 10))}</td>
    <td class="muted">${esc(c.expires_at.slice(0, 10))}</td>
    <td>${statusOf(c)}</td>
  </tr>`;
}

export function renderClaims(root: HTMLElement, deps: ClaimsDeps): void {
  root.innerHTML = `
    <form class="claim-form" autocomplete="off">
      <label>Hat <select class="claim-hat">${grouped()}</select></label>
      <label class="claim-variant-wrap">Variant <select class="claim-variant"></select></label>
      <label>Expires in <input class="claim-days" type="number" min="1" max="365" value="${DEFAULT_CLAIM_EXPIRY_DAYS}"> days</label>
      <button type="button" class="claim-generate">Generate</button>
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

  const hatSel = root.querySelector<HTMLSelectElement>('.claim-hat')!;
  const variantWrap = root.querySelector<HTMLElement>('.claim-variant-wrap')!;
  const variantSel = root.querySelector<HTMLSelectElement>('.claim-variant')!;
  const daysEl = root.querySelector<HTMLInputElement>('.claim-days')!;
  const resultEl = root.querySelector<HTMLElement>('.claim-result')!;
  const codeEl = root.querySelector<HTMLInputElement>('.claim-code')!;
  const listEl = root.querySelector<HTMLElement>('.claim-list')!;

  const syncVariants = () => {
    const hat: Hat | undefined = hatById(hatSel.value);
    const isLegendary = !hat || hat.rarity === 'legendary';
    variantWrap.hidden = isLegendary;
    variantSel.innerHTML = hat && hat.rarity !== 'legendary'
      ? hat.variants.map((_, i) => `<option value="${i}">#${i + 1}</option>`).join('')
      : '';
  };
  hatSel.addEventListener('change', syncVariants);
  syncVariants();

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

  const generateBtn = root.querySelector<HTMLButtonElement>('.claim-generate')!;
  generateBtn.addEventListener('click', () => {
    void (async () => {
      generateBtn.setAttribute('disabled', 'true');
      try {
        const hat = hatById(hatSel.value);
        const body: CreateClaimRequest = {
          item_type: 'hat',
          hat_id: hatSel.value,
          expires_in_days: Number(daysEl.value),
        };
        if (hat && hat.rarity !== 'legendary') body.variant = Number(variantSel.value);
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
