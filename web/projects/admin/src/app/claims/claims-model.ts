import type { AdminClaim, AdminClaimRedemption, Hat, HatRarity } from '@token-derby/shared';
import { HATS, hatById, isAnimatedHat } from '@token-derby/shared';
import type { TdOption } from '@token-derby/ui';

const RARITIES: readonly HatRarity[] = ['common', 'rare', 'epic', 'legendary', 'limited'];
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

/** Every hat, rarest last, labelled "Rarity · Name" since the select has no groups; exclusives are marked. */
export function hatOptions(): TdOption<string>[] {
  return RARITIES.flatMap((r) => HATS.filter((h) => h.rarity === r)
    .map((h) => ({ value: h.id, label: `${cap(r)} · ${h.name}${h.rollable ? '' : ' (exclusive)'}` })));
}

/** "Any" plus each variant (values are indexes as text), or null when the hat has no variants to pick. */
export function variantOptions(hatId: string): TdOption<string>[] | null {
  const hat: Hat | undefined = hatById(hatId);
  if (!hat || isAnimatedHat(hat)) return null;
  return [{ value: '', label: 'Any' }, ...hat.variants.map((_, i) => ({ value: String(i), label: `#${i + 1}` }))];
}

function hatLabel(hatId: string, variant: number | undefined): string {
  const hat = hatById(hatId);
  if (!hat) return hatId;
  return variant !== undefined && !isAnimatedHat(hat) ? `${hat.name} #${variant + 1}` : hat.name;
}

export function claimSummary(c: AdminClaim): string {
  if (c.entries.length !== 1) return `Pack of ${c.entries.length}`;
  return hatLabel(c.entries[0]!.hat_id, c.entries[0]!.variant);
}

export function claimStatus(c: AdminClaim, now: number): string {
  const tally = `${c.redeemed_count} / ${c.max_redemptions}`;
  if (c.redeemed_count >= c.max_redemptions) return `${tally} · spent`;
  if (Date.parse(c.expires_at) <= now) return `${tally} · expired`;
  return `${tally} redeemed`;
}

export function redemptionText(r: AdminClaimRedemption): string {
  const hat = hatLabel(r.hat_id, r.variant);
  const what = r.outcome === 'duplicate' ? `duplicate ${hat} · +${r.xp_awarded ?? 0} XP` : hat;
  return `${r.user_name ?? r.user_id} on ${r.horse_name ?? r.horse_id} — ${what}`;
}

/** The org's public page: the production site from production hosts, same-origin elsewhere. */
export function siteOrgUrl(name: string, hostname: string): string {
  const path = `/org/${encodeURIComponent(name)}`;
  return hostname.endsWith('.tokenderby.co.uk') ? `https://tokenderby.co.uk${path}` : path;
}
