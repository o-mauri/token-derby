import { describe, it, expect } from 'vitest';
import { finaliseRace } from '../../src/lib/finalise-race.js';
import { getStableHorse } from '../../src/db/stable.js';
import { seedRace } from '../helpers/races.js';

describe('recent_paces', () => {
  it('records output-equivalent tokens per minute', async () => {
    // Reuse seedRace's anchor for finalisation so the enrolled window is
    // exactly 120 minutes rather than drifting by the DB round-trip time.
    const { race, horses, now } = await seedRace({
      distinct_jockeys: 3,
      duration_hours: 2,          // 120 enrolled minutes
      counts_input: true,         // x10
      tokens: [1_200_000, 100, 100],
    });
    await finaliseRace(race, now);
    const h = await getStableHorse(horses[0]!.user_id, horses[0]!.stable_horse_id);
    expect(h!.recent_paces!.at(-1)).toBeCloseTo(1000, 3);   // 1.2M / 10 / 120
  });

  it('counts idle time against the horse', async () => {
    // Same tokens, twice the enrolled window: half the pace.
    const { race, horses, now } = await seedRace({
      distinct_jockeys: 3, duration_hours: 4, tokens: [1_200_000, 100, 100],
    });
    await finaliseRace(race, now);
    const h = await getStableHorse(horses[0]!.user_id, horses[0]!.stable_horse_id);
    expect(h!.recent_paces!.at(-1)).toBeCloseTo(5000, 3);   // 1.2M / 1 / 240
  });

  it('appends oldest-first across races', async () => {
    const jockey = { reuse: true } as any;
    for (const total of [600, 1200]) {
      const { race } = await seedRace({
        distinct_jockeys: 3, duration_hours: 1, tokens: [total, 10, 10], jockey,
      });
      await finaliseRace(race, new Date());
    }
    const h = await getStableHorse(jockey.user_id, jockey.stable_horse_id);
    expect(h!.recent_paces).toHaveLength(2);
    expect(h!.recent_paces![0]).toBeLessThan(h!.recent_paces![1]!);
  });

  it('does not double-append when finalisation is retried', async () => {
    const { race, horses } = await seedRace({
      distinct_jockeys: 3, duration_hours: 1, tokens: [600, 10, 10],
    });
    const now = new Date();
    await finaliseRace(race, now);
    await finaliseRace(race, now);
    const h = await getStableHorse(horses[0]!.user_id, horses[0]!.stable_horse_id);
    expect(h!.recent_paces).toHaveLength(1);
  });

  it('records a zero-pace race rather than skipping it', async () => {
    const { race, horses } = await seedRace({
      distinct_jockeys: 3, duration_hours: 1, tokens: [600, 10, 0],
    });
    await finaliseRace(race, new Date());
    const h = await getStableHorse(horses[2]!.user_id, horses[2]!.stable_horse_id);
    expect(h!.recent_paces).toEqual([0]);
  });

  it('records the counters but skips the pace for a sub-30-minute race', async () => {
    const { race, horses, now } = await seedRace({
      distinct_jockeys: 3, duration_hours: 0.25, tokens: [600, 10, 10],   // 15 enrolled minutes
    });
    await finaliseRace(race, now);
    const h = await getStableHorse(horses[0]!.user_id, horses[0]!.stable_horse_id);
    expect(h!.races_entered).toBe(1);
    expect(h!.total_tokens).toBe(600);
    expect(h!.recent_paces ?? []).toEqual([]);
  });
});
