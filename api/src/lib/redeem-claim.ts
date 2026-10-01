import { hatById, isAnimatedHat, levelInfo, normaliseClaimCode } from '@token-derby/shared';
import type { ClaimEntry, CollectedHat, ErrorCode, HatId } from '@token-derby/shared';
import { DUPLICATE_XP_FRACTION } from './roll-hat.js';
import { getClaim, getClaimRedemption, type ClaimRecord } from '../db/claims.js';
import { recordAttempt, CLAIM_LOOKUP_LIMIT } from '../db/rate-limits.js';

export type PackDecision =
  | { result: 'hat'; collected: CollectedHat }
  | { result: 'duplicate'; hat_id: HatId; variant?: number; xp_delta: number }
  | { result: 'unknown_hat' };

type Candidate = { hat_id: HatId; variant?: number };

/** Every collectible an entry can yield, and which of those are unowned. */
function candidatesFor(entry: ClaimEntry): Candidate[] {
  const hat = hatById(entry.hat_id);
  if (!hat) return [];
  if (isAnimatedHat(hat)) return [{ hat_id: hat.id }];
  if (entry.variant !== undefined) {
    return entry.variant >= 0 && entry.variant < hat.variants.length
      ? [{ hat_id: hat.id, variant: entry.variant }]
      : [];
  }
  return hat.variants.map((_, variant) => ({ hat_id: hat.id, variant }));
}

function owns(inventory: CollectedHat[], c: Candidate): boolean {
  return c.variant === undefined
    ? inventory.some(h => h.id === c.hat_id)
    : inventory.some(h => h.id === c.hat_id && h.variant === c.variant);
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(rng() * arr.length))]!;
}

/**
 * Decide what a pack pays out. Pure: does not mutate, caller persists.
 * Prefers entries the horse does not own; only a fully owned pack pays XP.
 */
export function decidePackOutcome(
  inventory: CollectedHat[],
  entries: ClaimEntry[],
  xp: number,
  rng: () => number = Math.random,
): PackDecision {
  const resolved = entries.map(candidatesFor).filter(cs => cs.length > 0);
  if (resolved.length === 0) return { result: 'unknown_hat' };

  // Pick an entry first, then within it, so a many-variant hat does not
  // crowd out a one-off sharing the same pack.
  const eligible = resolved
    .map(cs => cs.filter(c => !owns(inventory, c)))
    .filter(cs => cs.length > 0);

  if (eligible.length > 0) {
    const chosen = pick(pick(eligible, rng), rng);
    const collected: CollectedHat = { id: chosen.hat_id, obtained_at: new Date().toISOString() };
    if (chosen.variant !== undefined) collected.variant = chosen.variant;
    return { result: 'hat', collected };
  }

  const chosen = pick(pick(resolved, rng), rng);
  const hat = hatById(chosen.hat_id)!;
  const slice = levelInfo(xp).xp_for_level ?? 0;
  return {
    result: 'duplicate',
    hat_id: chosen.hat_id,
    variant: chosen.variant,
    xp_delta: Math.round(slice * DUPLICATE_XP_FRACTION[hat.rarity]),
  };
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
  // Advisory only, can go stale — redeemClaimSlot's transaction is the real
  // gate. Per-user check first, so a redeemer sees this over "fully redeemed".
  if (await getClaimRedemption(claim.code, user_id)) {
    return { ok: false, code: 'CLAIM_ALREADY_REDEEMED', message: 'You have already used this claim token' };
  }
  if (claim.redeemed_count >= claim.max_redemptions) {
    return { ok: false, code: 'CLAIM_EXHAUSTED', message: 'This claim token has been fully redeemed' };
  }
  if (Date.parse(claim.expires_at) <= Date.now()) {
    return { ok: false, code: 'CLAIM_EXPIRED', message: 'This claim token has expired' };
  }
  return { ok: true, claim };
}
