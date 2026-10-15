import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { AdminClaimRedemption, ClaimEntry, CreateClaimRequest } from '@token-derby/shared';
import { DEFAULT_CLAIM_EXPIRY_DAYS, MAX_CLAIM_EXPIRY_DAYS, MAX_CLAIM_REDEMPTIONS, MAX_PACK_ENTRIES, formatClaimCode } from '@token-derby/shared';
import { ApiError, Button, CopyField, Loader, Select, TextInput } from '@token-derby/ui';
import { AdminApi } from '../api/admin-api';
import { Loadable } from '../data/admin-data';
import { claimStatus, claimSummary, hatOptions, redemptionText, variantOptions } from './claims-model';

type Entry = { key: number; hatId: string; variant: string };
type Detail = { status: 'loading' | 'ready' | 'error'; lines: string[] };

/** A whole number within [lo, hi], or null when blank or out of range. */
const within = (v: unknown, lo: number, hi: number): number | null => {
  if (v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
};
const message = (e: unknown) => (e instanceof ApiError && e.code !== 'NETWORK_ERROR' ? e.message : "Couldn't generate a token. Try again.");

/** Make hat claim tokens (single hats or packs) and see who has redeemed the ones already made. */
@Component({
  selector: 'admin-claims-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button, CopyField, Loader, Select, TextInput],
  host: { 'data-page': 'claims' },
  templateUrl: './claims.page.html',
  styleUrl: './claims.page.scss',
})
export class ClaimsPage {
  private readonly api = inject(AdminApi);
  protected readonly claims = new Loadable(() => this.api.claims());

  protected readonly hats = hatOptions();
  protected readonly variants = variantOptions;
  protected readonly maxEntries = MAX_PACK_ENTRIES;
  private nextKey = 1;
  protected readonly entries = signal<Entry[]>([this.blank()]);
  protected readonly maxClaims = signal<string | number | null>(1);
  protected readonly days = signal<string | number | null>(DEFAULT_CLAIM_EXPIRY_DAYS);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly created = signal<string | null>(null);
  protected readonly details = signal<Record<string, Detail>>({});

  private readonly maxValue = computed(() => within(this.maxClaims(), 1, MAX_CLAIM_REDEMPTIONS));
  private readonly daysValue = computed(() => within(this.days(), 1, MAX_CLAIM_EXPIRY_DAYS));
  protected readonly limitError = computed(() =>
    this.maxValue() === null ? `Max claims must be 1–${MAX_CLAIM_REDEMPTIONS}.`
      : this.daysValue() === null ? `Expires must be 1–${MAX_CLAIM_EXPIRY_DAYS} days.` : null);

  protected readonly rows = computed(() => (this.claims.value()?.claims ?? []).map((c) => ({
    code: c.code, token: formatClaimCode(c.code), what: claimSummary(c), created: c.created_at.slice(0, 10),
    expires: c.expires_at.slice(0, 10), status: claimStatus(c, Date.now()), redeemed: c.redeemed_count > 0,
  })));

  constructor() {
    this.claims.ensure();
  }

  protected setHat(key: number, hatId: string | null): void {
    this.entries.update((all) => all.map((e) => (e.key === key ? { ...e, hatId: hatId ?? e.hatId, variant: '' } : e)));
  }

  protected setVariant(key: number, variant: string | null): void {
    this.entries.update((all) => all.map((e) => (e.key === key ? { ...e, variant: variant ?? '' } : e)));
  }

  protected add(): void {
    if (this.entries().length < this.maxEntries) this.entries.update((all) => [...all, this.blank()]);
  }

  protected remove(key: number): void {
    if (this.entries().length > 1) this.entries.update((all) => all.filter((e) => e.key !== key));
  }

  protected async generate(): Promise<void> {
    const max = this.maxValue();
    const days = this.daysValue();
    if (this.busy() || max === null || days === null) return;
    this.busy.set(true);
    this.error.set(null);
    const entries: ClaimEntry[] = this.entries().map((e) =>
      e.variant === '' || !variantOptions(e.hatId) ? { hat_id: e.hatId } : { hat_id: e.hatId, variant: Number(e.variant) });
    const body: CreateClaimRequest = {
      item_type: 'hat', entries,
      max_redemptions: max,
      expires_in_days: days,
    };
    try {
      const res = await this.api.createClaim(body);
      this.created.set(formatClaimCode(res.code));
      this.claims.reload();
    } catch (e) {
      this.error.set(message(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async toggleWho(code: string): Promise<void> {
    if (this.details()[code]) {
      this.details.update((all) => { const next = { ...all }; delete next[code]; return next; });
      return;
    }
    const set = (d: Detail) => this.details.update((all) => ({ ...all, [code]: d }));
    set({ status: 'loading', lines: [] });
    try {
      const { redemptions } = await this.api.redemptions(code);
      if (this.details()[code]) set({ status: 'ready', lines: redemptions.map((r: AdminClaimRedemption) => `${redemptionText(r)} · ${r.redeemed_at.slice(0, 10)}`) });
    } catch {
      if (this.details()[code]) set({ status: 'error', lines: [] });
    }
  }

  private blank(): Entry {
    return { key: this.nextKey++, hatId: this.hats[0]!.value, variant: '' };
  }
}
