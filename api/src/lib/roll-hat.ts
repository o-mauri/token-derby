import { HATS } from '@token-derby/shared';
import type { CollectedHat, Hat, HatId, HatRarity } from '@token-derby/shared';

export type RollDecision =
  | { result: 'hat'; collected: CollectedHat; hat: Hat }
  | { result: 'duplicate'; hat: Hat; hat_id: HatId; variant?: number }
  | { result: 'no_hat' };

const TIER_WEIGHTS: { tier: HatRarity | 'no_hat'; weight: number }[] = [
  { tier: 'no_hat',    weight: 0.40 },
  { tier: 'common',    weight: 0.37 },
  { tier: 'rare',      weight: 0.15 },
  { tier: 'epic',      weight: 0.07 },
  { tier: 'legendary', weight: 0.01 },
];

function pickTier(rng: () => number): HatRarity | 'no_hat' {
  const r = rng();
  let acc = 0;
  for (const { tier, weight } of TIER_WEIGHTS) {
    acc += weight;
    if (r < acc) return tier;
  }
  return 'no_hat';
}

function pickIndex<T>(arr: readonly T[], rng: () => number): number {
  return Math.min(arr.length - 1, Math.floor(rng() * arr.length));
}

/**
 * Compute a roll decision purely. Does not mutate. Caller persists.
 *
 * Roll model:
 *   1. Pick rarity tier (weighted: 40 no_hat / 37 common / 15 rare / 7 epic / 1 legendary).
 *   2. If a hat tier: pick hat uniformly within that tier.
 *   3. If non-legendary: pick variant uniformly within that hat.
 *   4. Check inventory for (id, variant) dupe.
 */
export function rollHat(inventory: CollectedHat[], rng: () => number = Math.random): RollDecision {
  const tier = pickTier(rng);
  if (tier === 'no_hat') return { result: 'no_hat' };

  // Claim-only hats are excluded from rolls entirely. A tier whose every hat
  // is claim-only degrades to no_hat rather than throwing.
  const pool = HATS.filter(h => h.rarity === tier && h.rollable);
  if (pool.length === 0) return { result: 'no_hat' };
  const hat = pool[pickIndex(pool, rng)]!;

  if (hat.rarity === 'legendary') {
    const alreadyHave = inventory.some(c => c.id === hat.id);
    if (alreadyHave) return { result: 'duplicate', hat, hat_id: hat.id };
    return {
      result: 'hat',
      hat,
      collected: { id: hat.id, obtained_at: new Date().toISOString() },
    };
  }

  const variantIdx = pickIndex(hat.variants, rng);
  const alreadyHave = inventory.some(c => c.id === hat.id && c.variant === variantIdx);
  if (alreadyHave) return { result: 'duplicate', hat, hat_id: hat.id, variant: variantIdx };
  return {
    result: 'hat',
    hat,
    collected: { id: hat.id, variant: variantIdx, obtained_at: new Date().toISOString() },
  };
}

/** XP fraction of `xp_for_level` awarded for a duplicate, by rarity. */
export const DUPLICATE_XP_FRACTION: Record<HatRarity, number> = {
  common: 0.10,
  rare: 0.20,
  epic: 0.35,
  legendary: 0.50,
};

/** XP fraction of `xp_for_level` awarded for the no_hat outcome. */
export const NO_HAT_XP_FRACTION = 0.20;
