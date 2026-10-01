import { describe, it, expect } from 'vitest';
import { makeUser, makeHorse } from '../helpers/auth-helper.js';
import { appendStableHorseHat, getStableHorse, deleteStableHorse } from '../../src/db/stable.js';

describe('appendStableHorseHat', () => {
  it('appends to an empty inventory and returns index 0', async () => {
    const user = await makeUser('AppendHat_Empty');
    const horse = await makeHorse(user, 'Gary');
    const idx = await appendStableHorseHat(user.user_id, horse.stable_horse_id, {
      id: 'flat_cap', variant: 0, obtained_at: '2026-08-18T00:00:00.000Z',
    });
    expect(idx).toBe(0);
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.hats).toHaveLength(1);
    expect(after?.hats?.[0]?.id).toBe('flat_cap');
  });

  it('appends in order and returns increasing indices', async () => {
    const user = await makeUser('AppendHat_Order');
    const horse = await makeHorse(user, 'Pony');
    const first = await appendStableHorseHat(user.user_id, horse.stable_horse_id, {
      id: 'flat_cap', variant: 0, obtained_at: 'a',
    });
    const second = await appendStableHorseHat(user.user_id, horse.stable_horse_id, {
      id: 'beanie', variant: 1, obtained_at: 'b',
    });
    expect([first, second]).toEqual([0, 1]);
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.hats?.map(h => h.id)).toEqual(['flat_cap', 'beanie']);
  });

  it('never touches last_rolled_level', async () => {
    const user = await makeUser('AppendHat_NoRollBump');
    const horse = await makeHorse(user, 'Dash');
    await appendStableHorseHat(user.user_id, horse.stable_horse_id, {
      id: 'flat_cap', variant: 0, obtained_at: 'a',
    });
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.last_rolled_level).toBeUndefined();
  });

  it('returns null when the horse is gone', async () => {
    const user = await makeUser('AppendHat_Deleted');
    const horse = await makeHorse(user, 'Ghost');
    await deleteStableHorse(user.user_id, horse);
    const idx = await appendStableHorseHat(user.user_id, horse.stable_horse_id, {
      id: 'flat_cap', variant: 0, obtained_at: 'a',
    });
    expect(idx).toBeNull();
  });
});
