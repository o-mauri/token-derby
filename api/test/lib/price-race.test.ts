import { describe, it, expect } from 'vitest';
import { priceRaceNow, ensureSnapshot } from '../../src/lib/price-race.js';
import { getSnapshot, listHistory } from '../../src/db/markets.js';
import { seedLiveRace } from '../helpers/races.js';

describe('priceRaceNow', () => {
  it('is deterministic within a bucket', async () => {
    const { race, horses } = await seedLiveRace({ runners: 4, elapsedMin: 90 });
    // Aligned to a minute boundary so both `t` and `t + 5_000` are provably in
    // the same bucket — a raw Date.now() is only *usually* true of that, and
    // flakes whenever the clock lands in the last 5s of a minute. Don't
    // "simplify" this back to Date.now().
    const t = Math.floor(Date.now() / 60_000) * 60_000;
    expect(priceRaceNow(race, horses, t)).toEqual(priceRaceNow(race, horses, t + 5_000));
  });

  it('changes bucket at the minute boundary', async () => {
    const { race, horses } = await seedLiveRace({ runners: 4, elapsedMin: 90 });
    const t = Date.now();
    const a = priceRaceNow(race, horses, t);
    const b = priceRaceNow(race, horses, t + 60_000);
    expect(b.bucket).toBe(a.bucket + 1);
  });

  it('prices every runner', async () => {
    const { race, horses } = await seedLiveRace({ runners: 6, elapsedMin: 120 });
    const snap = priceRaceNow(race, horses, Date.now());
    expect(snap.prices).toHaveLength(6);
    expect(snap.prices.reduce((s, p) => s + p.win, 0)).toBeGreaterThan(0.9);
  });

  it('includes phantoms early and none late', async () => {
    const early = await seedLiveRace({ runners: 2, elapsedMin: 30, durationHours: 12 });
    const late = await seedLiveRace({ runners: 2, elapsedMin: 500, durationHours: 12 });
    expect(priceRaceNow(early.race, early.horses, Date.now()).phantoms).toBeGreaterThan(0);
    expect(priceRaceNow(late.race, late.horses, Date.now()).phantoms).toBe(0);
  });
});

describe('ensureSnapshot', () => {
  it('returns null before the market opens', async () => {
    const { race, horses } = await seedLiveRace({ runners: 2, elapsedMin: 10 });
    expect(await ensureSnapshot(race, horses, Date.now())).toBeNull();
  });

  it('computes and stores on first read after the open', async () => {
    const { race, horses } = await seedLiveRace({ runners: 3, elapsedMin: 60 });
    const snap = await ensureSnapshot(race, horses, Date.now());
    expect(snap).not.toBeNull();
    expect((await getSnapshot(race.race_id))!.bucket).toBe(snap!.bucket);
  });

  it('serves the stored snapshot again within the same bucket', async () => {
    const { race, horses } = await seedLiveRace({ runners: 3, elapsedMin: 60 });
    // Aligned to a minute boundary — see the comment on the analogous
    // priceRaceNow test above; a raw Date.now() flakes near a minute rollover.
    const t = Math.floor(Date.now() / 60_000) * 60_000;
    const a = await ensureSnapshot(race, horses, t);
    const b = await ensureSnapshot(race, horses, t + 10_000);
    expect(b).toEqual(a);
  });

  it('appends history every five minutes, not every minute', async () => {
    const { race, horses } = await seedLiveRace({ runners: 3, elapsedMin: 60 });
    const base = Math.floor(Date.now() / 300_000) * 300_000;   // aligned to a 5-min boundary
    for (let m = 0; m < 10; m++) await ensureSnapshot(race, horses, base + m * 60_000);
    const hist = await listHistory(race.race_id);
    expect(hist).toHaveLength(2);
  });
});
