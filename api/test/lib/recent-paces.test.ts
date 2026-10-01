import { describe, it, expect } from 'vitest';
import { finaliseRace } from '../../src/lib/finalise-race.js';
import { getStableHorse } from '../../src/db/stable.js';
import { seedRace, setHorseSpanForTest } from '../helpers/races.js';

describe('recent_paces', () => {
  it('records scored tokens per minute', async () => {
    // Reuse seedRace's anchor for finalisation so the enrolled window is
    // exactly 120 minutes rather than drifting by the DB round-trip time.
    const { race, horses, now } = await seedRace({
      distinct_jockeys: 3,
      duration_hours: 2,          // 120 enrolled minutes
      tokens: [1_200_000, 100, 100],
    });
    await finaliseRace(race, now);
    const h = await getStableHorse(horses[0]!.user_id, horses[0]!.stable_horse_id);
    expect(h!.recent_paces!.at(-1)).toBeCloseTo(10_000, 3);   // 1.2M / 120
  });

  it('measures raw output over the scoring span when one is recorded', async () => {
    const { race, horses, now } = await seedRace({
      distinct_jockeys: 3, duration_hours: 4, tokens: [1_200_000, 100, 100],
    });
    // Present for 2 of the 4 hours: pace is over the 120-minute span, not 240.
    const startMs = now.getTime() - 4 * 3_600_000;
    await setHorseSpanForTest(race.race_id, horses[0]!.horse_id,
      new Date(startMs + 60 * 60_000).toISOString(), new Date(startMs + 180 * 60_000).toISOString());
    await finaliseRace(race, now);
    const h = await getStableHorse(horses[0]!.user_id, horses[0]!.stable_horse_id);
    expect(h!.recent_paces!.at(-1)).toBeCloseTo(10_000, 3);   // 1.2M / 120
  });

  it('records raw tokens, not scored distance', async () => {
    const { race, horses, now } = await seedRace({
      distinct_jockeys: 3, duration_hours: 2, tokens: [1_200_000, 100, 100], scored: [600_000, 100, 100],
    });
    await finaliseRace(race, now);
    const h = await getStableHorse(horses[0]!.user_id, horses[0]!.stable_horse_id);
    expect(h!.recent_paces!.at(-1)).toBeCloseTo(10_000, 3);   // raw 1.2M / 120, not 600k
  });

  it('counts idle time against the horse', async () => {
    // Same tokens, twice the enrolled window: half the pace.
    const { race, horses, now } = await seedRace({
      distinct_jockeys: 3, duration_hours: 4, tokens: [1_200_000, 100, 100],
    });
    await finaliseRace(race, now);
    const h = await getStableHorse(horses[0]!.user_id, horses[0]!.stable_horse_id);
    expect(h!.recent_paces!.at(-1)).toBeCloseTo(5000, 3);   // 1.2M / 240
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
