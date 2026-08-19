import { hatById, levelInfo, normaliseClaimCode } from '@token-derby/shared';
import type { CollectedHat, ErrorCode, HatId } from '@token-derby/shared';
import { DUPLICATE_XP_FRACTION } from './roll-hat.js';
import { getClaim, type ClaimRecord } from '../db/claims.js';
import { recordAttempt, CLAIM_LOOKUP_LIMIT } from '../db/rate-limits.js';

export type ClaimDecision =
  | { result: 'hat'; collected: CollectedHat }
  | { result: 'duplicate'; xp_delta: number }
  | { result: 'unknown_hat' };

/**
 * Decide what a claim pays out. Pure: does not mutate, caller persists.
 * A duplicate pays the same XP fraction as a rolled duplicate.
 */
export function decideClaimOutcome(
  inventory: CollectedHat[],
  hat_id: HatId,
  variant: number | undefined,
  xp: number,
): ClaimDecision {
  const hat = hatById(hat_id);
  if (!hat) return { result: 'unknown_hat' };

  const isLegendary = hat.rarity === 'legendary';
  const alreadyHave = isLegendary
    ? inventory.some(c => c.id === hat_id)
    : inventory.some(c => c.id === hat_id && c.variant === variant);

  if (alreadyHave) {
    const slice = levelInfo(xp).xp_for_level ?? 0;
    return {
      result: 'duplicate',
      xp_delta: Math.round(slice * DUPLICATE_XP_FRACTION[hat.rarity]),
    };
  }

  const collected: CollectedHat = { id: hat_id, obtained_at: new Date().toISOString() };
  if (!isLegendary) collected.variant = variant;
  return { result: 'hat', collected };
}

export type LookupResult =
  | { ok: true; claim: ClaimRecord }
  | { ok: false; code: ErrorCode; message: string };

/**
 * Resolve a user-supplied code. Only not-found outcomes charge the rate limit —
 * an attacker produces nothing else, and honest typos stay cheap.
 */
export async function lookupClaim(rawCode: string, user_id: string): Promise<LookupResult> {
  const code = normaliseClaimCode(rawCode);
  const claim = code ? await getClaim(code) : null;

  if (!claim) {
    const attempts = await recordAttempt('claim', user_id);
    if (attempts > CLAIM_LOOKUP_LIMIT) {
      return { ok: false, code: 'RATE_LIMITED', message: 'Too many invalid claim codes. Try again later.' };
    }
    return { ok: false, code: 'CLAIM_NOT_FOUND', message: 'No such claim token' };
  }
  if (claim.redeemed_at) {
    return { ok: false, code: 'CLAIM_ALREADY_REDEEMED', message: 'This claim token has already been used' };
  }
  if (Date.parse(claim.expires_at) <= Date.now()) {
    return { ok: false, code: 'CLAIM_EXPIRED', message: 'This claim token has expired' };
  }
  return { ok: true, claim };
}
