import { describe, it, expect } from 'vitest';
import { putStableHorse, getStableHorse, applyRollResult, equipHat } from '../../src/db/stable.js';
import type { StableHorse } from '@token-derby/shared';

function baseHorse(user_id: string, stable_horse_id: string, name = 'Test'): StableHorse {
  return {
    stable_horse_id,
    name,
    colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' },
    created_at: new Date().toISOString(),
    xp: 0,
  };
}

describe('applyRollResult', () => {
  it('appends to hats[] and increments last_rolled_level atomically', async () => {
    const user_id = `u-${Date.now()}`;
    const horse = baseHorse(user_id, 'h-roll-1');
    await putStableHorse(user_id, horse);

    await applyRollResult(user_id, 'h-roll-1', {
      expected_last_rolled_level: 0,
      append_hat: { id: 'flat_cap', variant: 0, obtained_at: new Date().toISOString() },
    });

    const after = await getStableHorse(user_id, 'h-roll-1');
    expect(after?.hats).toHaveLength(1);
    expect(after?.hats?.[0]?.id).toBe('flat_cap');
    expect(after?.last_rolled_level).toBe(1);
  });

  it('awards XP via xp_delta on no_hat / duplicate outcomes', async () => {
    const user_id = `u-${Date.now()}-x`;
    const horse = baseHorse(user_id, 'h-roll-2');
    await putStableHorse(user_id, horse);
    await applyRollResult(user_id, 'h-roll-2', {
      expected_last_rolled_level: 0,
      xp_delta: 15,
    });
    const after = await getStableHorse(user_id, 'h-roll-2');
    expect(after?.xp).toBe(15);
    expect(after?.last_rolled_level).toBe(1);
    expect(after?.hats ?? []).toHaveLength(0);
  });

  it('refuses to apply when expected_last_rolled_level is stale (optimistic concurrency)', async () => {
    const user_id = `u-${Date.now()}-c`;
    const horse = baseHorse(user_id, 'h-roll-3');
    await putStableHorse(user_id, horse);
    // First roll succeeds (expected_last_rolled_level=0)
    await applyRollResult(user_id, 'h-roll-3', {
      expected_last_rolled_level: 0,
      append_hat: { id: 'beanie', variant: 0, obtained_at: new Date().toISOString() },
    });
    // Second roll with stale value should fail (current is now 1, not 0)
    await expect(applyRollResult(user_id, 'h-roll-3', {
      expected_last_rolled_level: 0,
      append_hat: { id: 'beanie', variant: 1, obtained_at: new Date().toISOString() },
    })).rejects.toThrow();
  });
});

describe('equipHat', () => {
  it('sets equipped_hat to a given index', async () => {
    const user_id = `u-${Date.now()}-e1`;
    const horse = baseHorse(user_id, 'h-eq-1');
    horse.hats = [{ id: 'flat_cap', variant: 0, obtained_at: new Date().toISOString() }];
    await putStableHorse(user_id, horse);
    await equipHat(user_id, 'h-eq-1', 0);
    const after = await getStableHorse(user_id, 'h-eq-1');
    expect(after?.equipped_hat).toBe(0);
  });

  it('clears equipped_hat when index is null', async () => {
    const user_id = `u-${Date.now()}-e2`;
    const horse = baseHorse(user_id, 'h-eq-2');
    horse.hats = [{ id: 'flat_cap', variant: 0, obtained_at: new Date().toISOString() }];
    horse.equipped_hat = 0;
    await putStableHorse(user_id, horse);
    await equipHat(user_id, 'h-eq-2', null);
    const after = await getStableHorse(user_id, 'h-eq-2');
    expect(after?.equipped_hat == null).toBe(true);
  });
});
