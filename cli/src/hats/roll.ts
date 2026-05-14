import type { CollectedHat, HatRarity } from '@token-derby/shared';
import { HATS } from './definitions.js';
import { TINT_POOL } from './tints.js';

const TIERS: { rarity: HatRarity; weight: number }[] = [
  { rarity: 'common',    weight: 0.60 },
  { rarity: 'rare',      weight: 0.25 },
  { rarity: 'epic',      weight: 0.12 },
  { rarity: 'legendary', weight: 0.03 },
];

function pickTier(): HatRarity {
  const r = Math.random();
  let cumulative = 0;
  for (const { rarity, weight } of TIERS) {
    cumulative += weight;
    if (r < cumulative) return rarity;
  }
  return 'common';
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export function rollHat(): CollectedHat {
  const rarity = pickTier();
  const pool = HATS.filter(h => h.rarity === rarity);
  const hat = pickRandom(pool);
  const tint = rarity === 'legendary' ? undefined : pickRandom(TINT_POOL);
  return {
    id: hat.id,
    tint: tint ?? undefined,
    obtained_at: new Date().toISOString(),
  };
}
