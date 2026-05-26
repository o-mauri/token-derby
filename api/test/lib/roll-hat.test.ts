import { describe, it, expect } from 'vitest';
import { rollHat } from '../../src/lib/roll-hat.js';
import { HATS } from '@token-derby/shared';
import type { CollectedHat } from '@token-derby/shared';

function seededRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('rollHat', () => {
  it('returns no_hat when the tier roll lands in 0..0.4', () => {
    const rng = seededRng([0.0, 0.5]);
    const decision = rollHat([], rng);
    expect(decision.result).toBe('no_hat');
  });

  it('returns a common hat when tier roll is just past 0.4', () => {
    const rng = seededRng([0.41, 0.5, 0.5]);
    const decision = rollHat([], rng);
    expect(decision.result).toBe('hat');
    if (decision.result === 'hat') {
      const hat = HATS.find(h => h.id === decision.collected.id);
      expect(hat?.rarity).toBe('common');
    }
  });

  it('returns a rare hat when tier roll is in 0.78..0.92', () => {
    const rng = seededRng([0.80, 0.5, 0.5]);
    const decision = rollHat([], rng);
    expect(decision.result).toBe('hat');
    if (decision.result === 'hat') {
      const hat = HATS.find(h => h.id === decision.collected.id);
      expect(hat?.rarity).toBe('rare');
    }
  });

  it('returns an epic hat when tier roll is in 0.92..0.99', () => {
    const rng = seededRng([0.95, 0.5, 0.5]);
    const decision = rollHat([], rng);
    expect(decision.result).toBe('hat');
    if (decision.result === 'hat') {
      const hat = HATS.find(h => h.id === decision.collected.id);
      expect(hat?.rarity).toBe('epic');
    }
  });

  it('returns a legendary hat when tier roll is in 0.99..1.0', () => {
    const rng = seededRng([0.995, 0.5]);
    const decision = rollHat([], rng);
    expect(decision.result).toBe('hat');
    if (decision.result === 'hat') {
      const hat = HATS.find(h => h.id === decision.collected.id);
      expect(hat?.rarity).toBe('legendary');
      expect(decision.collected.variant).toBeUndefined();
    }
  });

  it('treats a re-roll of the same (id, variant) as a duplicate', () => {
    const commons = HATS.filter(h => h.rarity === 'common');
    const flatCapIdx = commons.findIndex(h => h.id === 'flat_cap');
    if (flatCapIdx < 0) throw new Error('flat_cap not in commons');
    // Land exactly on flat_cap (index/N + epsilon)
    const hatPick = flatCapIdx / commons.length + 0.0001;
    const variantPick = 0.001;  // variant 0
    const inventory: CollectedHat[] = [
      { id: 'flat_cap', variant: 0, obtained_at: '2026-01-01T00:00:00.000Z' },
    ];
    const rng = seededRng([0.5, hatPick, variantPick]);  // 0.5 → common tier
    const decision = rollHat(inventory, rng);
    expect(decision.result).toBe('duplicate');
    if (decision.result === 'duplicate') {
      expect(decision.hat_id).toBe('flat_cap');
      expect(decision.variant).toBe(0);
    }
  });

  it('treats a legendary re-roll as a duplicate (no variant field)', () => {
    const legendaries = HATS.filter(h => h.rarity === 'legendary');
    const target = legendaries[0]!;
    const inventory: CollectedHat[] = [
      { id: target.id, obtained_at: '2026-01-01T00:00:00.000Z' },
    ];
    const rng = seededRng([0.995, 0.0]);  // legendary tier, pick index 0
    const decision = rollHat(inventory, rng);
    expect(decision.result).toBe('duplicate');
    if (decision.result === 'duplicate') {
      expect(decision.variant).toBeUndefined();
      expect(decision.hat_id).toBe(target.id);
    }
  });
});
