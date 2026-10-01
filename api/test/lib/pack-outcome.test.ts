import { describe, it, expect } from 'vitest';
import { decidePackOutcome } from '../../src/lib/redeem-claim.js';
import { DUPLICATE_XP_FRACTION } from '../../src/lib/roll-hat.js';
import { levelInfo, thresholdForLevel, HATS, isAnimatedHat } from '@token-derby/shared';
import type { CollectedHat } from '@token-derby/shared';

function seededRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

const ANIMATED_ID = HATS.find(h => isAnimatedHat(h))!.id;

describe('decidePackOutcome', () => {
  it('awards the only entry of a one-entry pack', () => {
    const d = decidePackOutcome([], [{ hat_id: 'flat_cap', variant: 0 }], 0, seededRng([0]));
    expect(d.result).toBe('hat');
    if (d.result !== 'hat') throw new Error('unreachable');
    expect(d.collected).toEqual({ id: 'flat_cap', variant: 0, obtained_at: expect.any(String) });
  });

  it('rolls a variant when the entry does not pin one', () => {
    const d = decidePackOutcome([], [{ hat_id: 'flat_cap' }], 0, seededRng([0, 0.99]));
    if (d.result !== 'hat') throw new Error('expected hat');
    const hat = HATS.find(h => h.id === 'flat_cap')!;
    if (isAnimatedHat(hat)) throw new Error('fixture must be a variant hat');
    expect(d.collected.variant).toBe(hat.variants.length - 1);
  });

  it('skips entries the horse already owns', () => {
    const inv: CollectedHat[] = [{ id: 'flat_cap', variant: 0, obtained_at: 'x' }];
    const entries = [{ hat_id: 'flat_cap', variant: 0 }, { hat_id: 'beanie', variant: 0 }];
    // rng 0 would pick entry 0 if owned entries were still eligible.
    const d = decidePackOutcome(inv, entries, 0, seededRng([0]));
    if (d.result !== 'hat') throw new Error('expected hat');
    expect(d.collected.id).toBe('beanie');
  });

  it('picks uniformly across entries, not across flattened variants', () => {
    // flat_cap has 4 variants, the animated hat has 1. A flattened pick would
    // choose flat_cap for any rng below 0.8; a per-entry pick splits at 0.5.
    const entries = [{ hat_id: 'flat_cap' }, { hat_id: ANIMATED_ID }];
    const first = decidePackOutcome([], entries, 0, seededRng([0.4, 0]));
    const second = decidePackOutcome([], entries, 0, seededRng([0.6, 0]));
    if (first.result !== 'hat' || second.result !== 'hat') throw new Error('expected hats');
    expect(first.collected.id).toBe('flat_cap');
    expect(second.collected.id).toBe(ANIMATED_ID);
  });

  it('offers only the unowned variants of a partially owned entry', () => {
    const hat = HATS.find(h => h.id === 'flat_cap')!;
    if (isAnimatedHat(hat)) throw new Error('fixture must be a variant hat');
    const inv: CollectedHat[] = hat.variants
      .map((_, i) => ({ id: 'flat_cap', variant: i, obtained_at: 'x' }))
      .filter(c => c.variant !== 2);
    const d = decidePackOutcome(inv, [{ hat_id: 'flat_cap' }], 0, seededRng([0, 0]));
    if (d.result !== 'hat') throw new Error('expected hat');
    expect(d.collected.variant).toBe(2);
  });

  it('matches an animated duplicate on id alone', () => {
    const inv: CollectedHat[] = [{ id: ANIMATED_ID, obtained_at: 'x' }];
    const d = decidePackOutcome(inv, [{ hat_id: ANIMATED_ID }], 0, seededRng([0]));
    expect(d.result).toBe('duplicate');
  });

  it('omits variant on an awarded animated hat', () => {
    const d = decidePackOutcome([], [{ hat_id: ANIMATED_ID }], 0, seededRng([0]));
    if (d.result !== 'hat') throw new Error('expected hat');
    expect(d.collected.variant).toBeUndefined();
  });

  it('pays duplicate XP only when every entry is fully owned', () => {
    const xp = thresholdForLevel(3);
    const slice = levelInfo(xp).xp_for_level ?? 0;
    const inv: CollectedHat[] = [
      { id: 'flat_cap', variant: 0, obtained_at: 'x' },
      { id: 'beanie', variant: 0, obtained_at: 'x' },
    ];
    const entries = [{ hat_id: 'flat_cap', variant: 0 }, { hat_id: 'beanie', variant: 0 }];
    const d = decidePackOutcome(inv, entries, xp, seededRng([0, 0]));
    if (d.result !== 'duplicate') throw new Error('expected duplicate');
    expect(d.xp_delta).toBe(Math.round(slice * DUPLICATE_XP_FRACTION.common));
    expect(d.hat_id).toBe('flat_cap');
    expect(d.variant).toBe(0);
  });

  it('pays zero duplicate XP at max level where xp_for_level is null', () => {
    const inv: CollectedHat[] = [{ id: 'flat_cap', variant: 0, obtained_at: 'x' }];
    const d = decidePackOutcome(inv, [{ hat_id: 'flat_cap', variant: 0 }], thresholdForLevel(999), seededRng([0]));
    if (d.result !== 'duplicate') throw new Error('expected duplicate');
    expect(d.xp_delta).toBe(0);
  });

  it('drops entries whose hat left the catalog but honours the survivors', () => {
    const entries = [{ hat_id: 'no_such_hat' }, { hat_id: 'flat_cap', variant: 0 }];
    const d = decidePackOutcome([], entries, 0, seededRng([0]));
    if (d.result !== 'hat') throw new Error('expected hat');
    expect(d.collected.id).toBe('flat_cap');
  });

  it('reports unknown_hat when no entry survives catalog resolution', () => {
    expect(decidePackOutcome([], [{ hat_id: 'no_such_hat' }], 0, seededRng([0])).result).toBe('unknown_hat');
  });

  it('reports unknown_hat for an empty entry list', () => {
    expect(decidePackOutcome([], [], 0, seededRng([0])).result).toBe('unknown_hat');
  });

  it('ignores a pinned variant that is out of range for its hat', () => {
    const d = decidePackOutcome([], [{ hat_id: 'flat_cap', variant: 99 }], 0, seededRng([0]));
    expect(d.result).toBe('unknown_hat');
  });
});
