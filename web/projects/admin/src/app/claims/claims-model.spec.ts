import type { AdminClaim, AdminClaimRedemption } from '@token-derby/shared';
import { claimStatus, claimSummary, hatOptions, redemptionText, siteOrgUrl, variantOptions } from './claims-model';

const claim = (over: Partial<AdminClaim> = {}): AdminClaim => ({
  code: 'ABCD1234', item_type: 'hat', entries: [{ hat_id: 'party_hat' }], max_redemptions: 5, redeemed_count: 2,
  created_at: '2026-10-01T00:00:00Z', expires_at: '2026-11-01T00:00:00Z', ...over,
});
const NOW = Date.parse('2026-10-06T00:00:00Z');

describe('claims model', () => {
  it('offers hats in rarity order, labelled with rarity and marking exclusives', () => {
    const opts = hatOptions();
    const rarities = opts.map((o) => o.label.split(' · ')[0]);
    expect(rarities.indexOf('Rare')).toBeGreaterThan(rarities.lastIndexOf('Common'));
    expect(rarities.at(-1)).toBe('Limited');
    expect(opts.find((o) => o.value === 'bearskin')?.label).toBe('Limited · Bearskin (exclusive)');
    expect(opts.find((o) => o.value === 'flat_cap')?.label).toBe('Common · Flat Cap');
  });

  it('offers Any plus each variant, and nothing for an animated hat', () => {
    expect(variantOptions('party_hat')).toEqual([
      { value: '', label: 'Any' }, { value: '0', label: '#1' }, { value: '1', label: '#2' }, { value: '2', label: '#3' }, { value: '3', label: '#4' },
    ]);
    expect(variantOptions('rainbow_crown')).toBeNull();
  });

  it('summarises a claim', () => {
    expect(claimSummary(claim())).toBe('Party Hat');
    expect(claimSummary(claim({ entries: [{ hat_id: 'party_hat', variant: 2 }] }))).toBe('Party Hat #3');
    expect(claimSummary(claim({ entries: [{ hat_id: 'party_hat' }, { hat_id: 'flat_cap' }] }))).toBe('Pack of 2');
  });

  it('describes how far a claim has gone', () => {
    expect(claimStatus(claim(), NOW)).toBe('2 / 5 redeemed');
    expect(claimStatus(claim({ redeemed_count: 5 }), NOW)).toBe('5 / 5 · spent');
    expect(claimStatus(claim({ expires_at: '2026-10-01T00:00:00Z' }), NOW)).toBe('2 / 5 · expired');
  });

  it('describes a redemption', () => {
    const r: AdminClaimRedemption = { user_id: 'u1', user_name: 'Omar', horse_id: 'h1', horse_name: 'Gallopz', redeemed_at: '2026-10-02T00:00:00Z', outcome: 'hat', hat_id: 'party_hat', variant: 1 };
    expect(redemptionText(r)).toBe('Omar on Gallopz — Party Hat #2');
    expect(redemptionText({ ...r, outcome: 'duplicate', xp_awarded: 50 })).toBe('Omar on Gallopz — duplicate Party Hat #2 · +50 XP');
    expect(redemptionText({ ...r, user_name: undefined, horse_name: undefined })).toBe('u1 on h1 — Party Hat #2');
  });

  it('links an org to its public page on the site', () => {
    expect(siteOrgUrl('Stack One', 'admin.tokenderby.co.uk')).toBe('https://tokenderby.co.uk/org/Stack%20One');
    expect(siteOrgUrl('Stackone', 'localhost')).toBe('/org/Stackone');
  });
});
