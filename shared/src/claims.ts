import type { CollectedHat, HatId } from './types.js';

export const DEFAULT_CLAIM_EXPIRY_DAYS = 30;
export const MAX_CLAIM_EXPIRY_DAYS = 365;

/** Only 'hat' is implemented; the discriminant exists for future cosmetics. */
export type ClaimItemType = 'hat';

export type CreateClaimRequest = {
  item_type: ClaimItemType;
  hat_id: HatId;
  variant?: number;          // required for non-legendary, absent for legendary
  expires_in_days?: number;   // 1..365, default 30
};

export type CreateClaimResponse = {
  code: string;               // canonical, no dashes
  item_type: ClaimItemType;
  hat_id: HatId;
  variant?: number;
  expires_at: string;
};

export type AdminClaim = {
  code: string;
  item_type: ClaimItemType;
  hat_id: HatId;
  variant?: number;
  created_at: string;
  expires_at: string;
  redeemed_at?: string;
  redeemed_by?: string;         // user_id
  redeemed_by_name?: string;
  redeemed_horse_id?: string;
  redeemed_horse_name?: string;
  outcome?: 'hat' | 'duplicate';
  xp_awarded?: number;
};

export type AdminClaimsResponse = { claims: AdminClaim[] };

/** Deliberately reveals no hat identity — the reveal animation is the payoff. */
export type ClaimProbeResponse = { item_type: ClaimItemType };

export type RedeemClaimRequest = { stable_horse_id: string };

export type RedeemClaimResponse =
  | { result: 'hat'; collected: CollectedHat; hat_index: number }
  | { result: 'duplicate'; hat_id: HatId; variant?: number; xp_awarded: number; new_xp: number };
