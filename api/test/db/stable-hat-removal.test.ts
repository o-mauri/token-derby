import { describe, it, expect } from 'vitest';
import { putStableHorse, getStableHorse, equipHat, removeStableHorseHat } from '../../src/db/stable.js';
import type { StableHorse } from '@token-derby/shared';

const uid = () => `u-${Math.random().toString(36).slice(2)}`;

function horse(): StableHorse {
  return {
    stable_horse_id: `sh-${Math.random().toString(36).slice(2)}`,
    name: `H${Math.random().toString(36).slice(2, 6)}`,
    colors: { body: '#c0392b', mane: '#000', tail: '#000', saddle: '#fff' },
    created_at: '2026-04-01T00:00:00.000Z',
    xp: 0,
    hats: [
      { id: 'flat_cap', variant: 0, obtained_at: '2026-04-02T00:00:00.000Z' },
      { id: 'beanie', variant: 1, obtained_at: '2026-04-03T00:00:00.000Z' },
      { id: 'fez', variant: 0, obtained_at: '2026-04-04T00:00:00.000Z' },
    ],
  };
}

describe('removeStableHorseHat', () => {
  it('removes the hat at the index and keeps the rest in order', async () => {
    const u = uid(); const h = horse();
    await putStableHorse(u, h);
    const updated = await removeStableHorseHat(u, h.stable_horse_id, 1);
    expect(updated.hats!.map(x => x.id)).toEqual(['flat_cap', 'fez']);
    const reread = await getStableHorse(u, h.stable_horse_id);
    expect(reread!.hats!.map(x => x.id)).toEqual(['flat_cap', 'fez']);
  });

  it('clears equipped_hat when the equipped hat is removed', async () => {
    const u = uid(); const h = horse();
    await putStableHorse(u, h);
    await equipHat(u, h.stable_horse_id, 1);
    const updated = await removeStableHorseHat(u, h.stable_horse_id, 1);
    expect(updated.equipped_hat ?? null).toBeNull();
  });

  it('decrements equipped_hat when an earlier hat is removed', async () => {
    const u = uid(); const h = horse();
    await putStableHorse(u, h);
    await equipHat(u, h.stable_horse_id, 2);
    const updated = await removeStableHorseHat(u, h.stable_horse_id, 0);
    expect(updated.equipped_hat).toBe(1);
  });

  it('leaves equipped_hat untouched when a later hat is removed', async () => {
    const u = uid(); const h = horse();
    await putStableHorse(u, h);
    await equipHat(u, h.stable_horse_id, 0);
    const updated = await removeStableHorseHat(u, h.stable_horse_id, 2);
    expect(updated.equipped_hat).toBe(0);
  });
});
