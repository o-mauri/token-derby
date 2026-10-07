import type { StableHorse } from '@token-derby/shared';
import { avgFinish, bestHorse, hatCollection, sortStable, totals, wornHat } from './paddock-model';

const C = { body: '#000', mane: '#000', tail: '#000', saddle: '#000' };
const horse = (over: Partial<StableHorse>): StableHorse => ({ stable_horse_id: 'h', name: 'H', colors: C, created_at: '2026-05-01T00:00:00Z', xp: 0, ...over });

describe('paddock model', () => {
  it('totals your horses, counting missing stats as 0', () => {
    const t = totals([
      horse({ races_entered: 30, wins: 4, podiums: 9, total_tokens: 1_000_000, xp: 900 }),
      horse({ xp: undefined as unknown as number }),
    ]);
    expect(t).toEqual({ horses: 2, races: 30, wins: 4, podiums: 9, tokens: 1_000_000, xp: 900 });
  });

  it('orders the stable by wins, then races, then name', () => {
    const names = sortStable([
      horse({ name: 'Cara', wins: 1, races_entered: 5 }),
      horse({ name: 'Bolt', wins: 4, races_entered: 30 }),
      horse({ name: 'Abel', wins: 1, races_entered: 5 }),
      horse({ name: 'Dot', wins: 1, races_entered: 9 }),
    ]).map((h) => h.name);
    expect(names).toEqual(['Bolt', 'Dot', 'Abel', 'Cara']);
  });

  it('picks the best horse, or none', () => {
    expect(bestHorse([horse({ name: 'A' }), horse({ name: 'B', wins: 2 })])?.name).toBe('B');
    expect(bestHorse([])).toBeNull();
  });

  it('works out the average finish, or a dash', () => {
    expect(avgFinish(horse({ races_entered: 30, total_finishing_position: 75 }))).toBe('2.5');
    expect(avgFinish(horse({ races_entered: 0, total_finishing_position: 0 }))).toBe('—');
    expect(avgFinish(horse({}))).toBe('—');
  });

  it('finds the hat a horse wears, and none when the index is missing or out of range', () => {
    const hats = [{ id: 'party_hat', obtained_at: 'x' }, { id: 'cowboy_hat', obtained_at: 'x', variant: 2 }];
    expect(wornHat(horse({ hats, equipped_hat: 1 }))).toEqual({ id: 'cowboy_hat', variant: 2 });
    expect(wornHat(horse({ hats, equipped_hat: 0 }))).toEqual({ id: 'party_hat', variant: 0 });
    for (const equipped_hat of [null, undefined, 5]) expect(wornHat(horse({ hats, equipped_hat }))).toBeNull();
  });

  it('lists the collection newest first by full time, with undated hats last', () => {
    const rows = hatCollection(horse({
      equipped_hat: 0,
      hats: [
        { id: 'party_hat', obtained_at: '2026-05-01T10:00:00Z' },
        { id: 'mystery_hat', obtained_at: '' },
        { id: 'cowboy_hat', obtained_at: '2026-05-01T18:00:00Z', variant: 1 },
      ],
    }));
    expect(rows.map((r) => r.id)).toEqual(['cowboy_hat', 'party_hat', 'mystery_hat']);
    expect(rows.map((r) => r.equipped)).toEqual([false, true, false]);
    expect(rows[0]).toMatchObject({ name: 'Cowboy Hat', variant: 1 });
    expect(rows[2]).toMatchObject({ name: 'mystery_hat', rarity: 'common' });
  });
});
