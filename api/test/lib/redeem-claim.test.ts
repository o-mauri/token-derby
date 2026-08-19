import { describe, it, expect } from 'vitest';
import { decideClaimOutcome } from '../../src/lib/redeem-claim.js';
import { DUPLICATE_XP_FRACTION } from '../../src/lib/roll-hat.js';
import { levelInfo, thresholdForLevel, HATS } from '@token-derby/shared';
import type { CollectedHat } from '@token-derby/shared';

const LEGENDARY_ID = HATS.find(h => h.rarity === 'legendary')!.id;

describe('decideClaimOutcome', () => {
  it('awards the hat when the horse does not own it', () => {
    const d = decideClaimOutcome([], 'flat_cap', 0, 0);
    expect(d.result).toBe('hat');
    if (d.result !== 'hat') throw new Error('unreachable');
    expect(d.collected.id).toBe('flat_cap');
    expect(d.collected.variant).toBe(0);
    expect(Date.parse(d.collected.obtained_at)).not.toBeNaN();
  });

  it('treats a different variant of the same hat as a new collectible', () => {
    const inv: CollectedHat[] = [{ id: 'flat_cap', variant: 1, obtained_at: 'x' }];
    expect(decideClaimOutcome(inv, 'flat_cap', 0, 0).result).toBe('hat');
  });

  it('detects a duplicate on matching id and variant', () => {
    const inv: CollectedHat[] = [{ id: 'flat_cap', variant: 0, obtained_at: 'x' }];
    expect(decideClaimOutcome(inv, 'flat_cap', 0, 0).result).toBe('duplicate');
  });

  it('pays the rarity-appropriate duplicate XP', () => {
    const xp = thresholdForLevel(3);
    const slice = levelInfo(xp).xp_for_level ?? 0;
    const inv: CollectedHat[] = [{ id: 'flat_cap', variant: 0, obtained_at: 'x' }];
    const d = decideClaimOutcome(inv, 'flat_cap', 0, xp);
    if (d.result !== 'duplicate') throw new Error('expected duplicate');
    expect(d.xp_delta).toBe(Math.round(slice * DUPLICATE_XP_FRACTION.common));
  });

  it('matches a legendary duplicate on id alone', () => {
    const inv: CollectedHat[] = [{ id: LEGENDARY_ID, obtained_at: 'x' }];
    expect(decideClaimOutcome(inv, LEGENDARY_ID, undefined, 0).result).toBe('duplicate');
    expect(decideClaimOutcome([], LEGENDARY_ID, undefined, 0).result).toBe('hat');
  });

  it('omits variant on an awarded legendary', () => {
    const d = decideClaimOutcome([], LEGENDARY_ID, undefined, 0);
    if (d.result !== 'hat') throw new Error('expected hat');
    expect(d.collected.variant).toBeUndefined();
  });

  it('reports unknown_hat for an id absent from the catalog', () => {
    expect(decideClaimOutcome([], 'no_such_hat', 0, 0).result).toBe('unknown_hat');
  });

  it('pays zero duplicate XP at max level where xp_for_level is null', () => {
    const inv: CollectedHat[] = [{ id: 'flat_cap', variant: 0, obtained_at: 'x' }];
    const maxXp = thresholdForLevel(999);
    const d = decideClaimOutcome(inv, 'flat_cap', 0, maxXp);
    if (d.result !== 'duplicate') throw new Error('expected duplicate');
    expect(d.xp_delta).toBe(0);
  });
});
