import type { CollectedHat, HatId } from './types.js';

export const DEFAULT_CLAIM_EXPIRY_DAYS = 30;
export const MAX_CLAIM_EXPIRY_DAYS = 365;
export const MAX_PACK_ENTRIES = 20;
export const MAX_CLAIM_REDEMPTIONS = 500;

/** Only 'hat' is implemented; the discriminant exists for future cosmetics. */
export type ClaimItemType = 'hat';

/** One candidate in a pack. An absent variant is rolled at redemption. */
export type ClaimEntry = { hat_id: HatId; variant?: number };

export type CreateClaimRequest = {
  item_type: ClaimItemType;
  entries: ClaimEntry[];        // 1..MAX_PACK_ENTRIES
  max_redemptions?: number;     // 1..MAX_CLAIM_REDEMPTIONS, default 1
  expires_in_days?: number;     // 1..365, default 30
  // Legacy single-hat shape, still accepted so api and admin need not
  // deploy in lockstep. Ignored when `entries` is present.
  hat_id?: HatId;
  variant?: number;
};

export type CreateClaimResponse = {
  code: string;                 // canonical, no dashes
  item_type: ClaimItemType;
  entries: ClaimEntry[];
  max_redemptions: number;
  expires_at: string;
};

export type AdminClaimRedemption = {
  user_id: string;
  user_name?: string;
  horse_id: string;
  horse_name?: string;
  redeemed_at: string;
  outcome: 'hat' | 'duplicate';
  hat_id: HatId;
  variant?: number;
  xp_awarded?: number;
};

export type AdminClaim = {
  code: string;
  item_type: ClaimItemType;
  entries: ClaimEntry[];
  max_redemptions: number;
  redeemed_count: number;
  created_at: string;
  expires_at: string;
};

export type AdminClaimsResponse = { claims: AdminClaim[] };
export type AdminClaimRedemptionsResponse = { redemptions: AdminClaimRedemption[] };

/** Reveals pack size and remaining slots, never hat identity. */
export type ClaimProbeResponse = {
  item_type: ClaimItemType;
  entry_count: number;
  remaining: number;
};

export type RedeemClaimRequest = { stable_horse_id: string };

export type RedeemClaimResponse =
  | { result: 'hat'; collected: CollectedHat; hat_index: number }
  | { result: 'duplicate'; hat_id: HatId; variant?: number; xp_awarded: number; new_xp: number };
