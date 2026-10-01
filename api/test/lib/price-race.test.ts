import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { encodeDensity, fitDensity } from '@token-derby/shared';
import { priceRaceNow, ensureSnapshot, loadRoster, EMPTY_ROSTER, matrixFetchCount, setPreparedCacheMaxForTest } from '../../src/lib/price-race.js';
import { getSnapshot, listHistory } from '../../src/db/markets.js';
import { putHabitRows, ORG_HABIT_ID, type HabitRow } from '../../src/db/habits.js';
import { putStableHorse } from '../../src/db/stable.js';
import { seedLiveRace } from '../helpers/races.js';

// One shared future stamp so every row counts as the latest fit.
const FIT_AT = new Date(Date.now() + 3_600_000).toISOString();

const habit = (user_id: string, spans: Array<[number, number]>, extra: Partial<HabitRow> = {}): HabitRow => ({
  user_id, is_debutant: user_id === ORG_HABIT_ID, login_propensity: 0.9, avg_daily_race_hours: 8,
  peak_activity_window: { start: '09:00', end: '12:00' }, hourly_probability_array: new Array(24).fill(0),
  span_count: spans.length, last_updated: FIT_AT,
  habit_matrix_data: encodeDensity(fitDensity(spans.map(([arrival, departure]) => ({ arrival, departure })))!),
  ...extra,
});

describe('priceRaceNow', () => {
  it('is deterministic within a bucket', async () => {
    const { race, horses } = await seedLiveRace({ runners: 4, elapsedMin: 90 });
    const t = Math.floor(Date.now() / 60_000) * 60_000;
    expect(priceRaceNow(race, horses, t)).toEqual(priceRaceNow(race, horses, t + 5_000));
  });

  it('changes bucket at the minute boundary', async () => {
    const { race, horses } = await seedLiveRace({ runners: 4, elapsedMin: 90 });
    const t = Date.now();
    expect(priceRaceNow(race, horses, t + 60_000).bucket).toBe(priceRaceNow(race, horses, t).bucket + 1);
  });

  it('prices every joined runner, with win summing to 1 when nobody else is coming', async () => {
    const { race, horses } = await seedLiveRace({ runners: 6, elapsedMin: 120 });
    const snap = priceRaceNow(race, horses, Date.now(), EMPTY_ROSTER);
    expect(snap.prices).toHaveLength(6);
    expect(snap.prices.every((p) => p.joined)).toBe(true);
    expect(snap.prices.reduce((s, p) => s + p.win, 0)).toBeCloseTo(1, 6);
    expect(snap.not_joined).toEqual([]);
  });

  it('clamps a race that ends after midnight', async () => {
    const { race, horses } = await seedLiveRace({ runners: 3, elapsedMin: 60, durationHours: 30 });
    const snap = priceRaceNow(race, horses, Date.now(), EMPTY_ROSTER);
    expect(snap.prices.every((p) => Number.isFinite(p.win) && Number.isFinite(p.podium))).toBe(true);
  });
});

describe('priceRaceNow pace and midnight', () => {
  it('uses the observed span: recorded scoring time beats prior-only at equal tokens', async () => {
    const { race, horses } = await seedLiveRace({
      runners: 2, elapsedMin: 120, tokens: [900_000, 900_000], priorPace: [1_000, 1_000],
      firstScoredMin: [0], lastScoredMin: [60],
    });
    const snap = priceRaceNow(race, horses, Date.now(), EMPTY_ROSTER);
    const win = (i: number) => snap.prices.find((p) => p.horse_id === horses[i]!.horse_id)!.win;
    expect(win(0)).toBeGreaterThan(win(1));
  });

  it('freezes at the finish once a sub-24h race crosses local midnight', async () => {
    const { race, horses } = await seedLiveRace({ runners: 2, elapsedMin: 60, tokens: [500_000, 100_000] });
    const day = new Date().toISOString().slice(0, 10);
    const r = { ...race, tz: 'UTC', start_time: `${day}T23:00:00.000Z`, end_time: new Date(Date.parse(`${day}T23:00:00.000Z`) + 4 * 3_600_000).toISOString() };
    const snap = priceRaceNow(r, horses, Date.parse(`${day}T23:00:00.000Z`) + 2 * 3_600_000, EMPTY_ROSTER);
    expect(snap.prices.every((p) => Number.isFinite(p.win) && Number.isFinite(p.podium))).toBe(true);
    expect(snap.prices.find((p) => p.horse_id === horses[0]!.horse_id)!.win).toBe(1);
  });
});

describe('loadRoster', () => {
  it('adds known org players who have not joined, with their stable horse', async () => {
    const org = `org-${randomUUID()}`;
    const { race, horses } = await seedLiveRace({ runners: 2, elapsedMin: 60, orgId: org, durationHours: 8 });
    await putStableHorse('eve', {
      stable_horse_id: 'sh-eve', name: 'Evening Star', colors: { body: '#123456', mane: '#000', tail: '#000', saddle: '#fff' },
      xp: 0, recent_paces: [20_000], created_at: new Date().toISOString(),
    } as any);
    await putHabitRows(org, [
      habit('eve', [[600, 1000], [620, 1020]], { stable_horse_id: 'sh-eve' }),
      habit(ORG_HABIT_ID, [[540, 1020], [560, 1000]]),
    ]);
    const roster = await loadRoster(race, horses, Date.now());
    expect(roster.notJoined.map((p) => p.user_id)).toEqual(['eve']);
    expect(roster.notJoined[0]!.runner.name).toBe('Evening Star');
    expect(roster.notJoined[0]!.prior_pace).toBe(20_000);
    expect(roster.fallback).not.toBeNull();
    const snap = priceRaceNow(race, horses, Date.now(), roster);
    expect(snap.prices).toHaveLength(3);
    expect(snap.prices.find((p) => !p.joined)!.horse_id).toBe(roster.notJoined[0]!.runner.horse_id);
    expect(snap.not_joined).toHaveLength(1);
  });

  it('does not double-count a joined player who also has habits', async () => {
    const org = `org-${randomUUID()}`;
    const { race, horses } = await seedLiveRace({ runners: 2, elapsedMin: 60, orgId: org });
    await putHabitRows(org, [habit(horses[0]!.user_id!, [[540, 1020], [550, 1010]], { stable_horse_id: horses[0]!.stable_horse_id })]);
    const roster = await loadRoster(race, horses, Date.now());
    expect(roster.notJoined).toEqual([]);
    expect(roster.habits.has(horses[0]!.user_id!)).toBe(true);
  });

  it('skips a not-joined player whose stable horse is gone', async () => {
    const org = `org-${randomUUID()}`;
    const { race, horses } = await seedLiveRace({ runners: 2, elapsedMin: 60, orgId: org });
    await putHabitRows(org, [habit('ghost', [[540, 1020], [560, 1000]], { stable_horse_id: 'sh-deleted' })]);
    const roster = await loadRoster(race, horses, Date.now());
    expect(roster.notJoined).toEqual([]);
  });

  it('returns an empty roster for a race with no org', async () => {
    const { race, horses } = await seedLiveRace({ runners: 2, elapsedMin: 60 });
    expect(await loadRoster(race, horses, Date.now())).toEqual(EMPTY_ROSTER);
  });

  it('fetches no matrices on a warm recompute with unchanged fits', async () => {
    const org = `org-${randomUUID()}`;
    const { race, horses } = await seedLiveRace({ runners: 2, elapsedMin: 60, orgId: org });
    await putHabitRows(org, [habit(horses[0]!.user_id!, [[540, 1020], [560, 1000]])]);
    const first = matrixFetchCount();
    await loadRoster(race, horses, Date.now());
    expect(matrixFetchCount()).toBe(first + 1);
    const before = matrixFetchCount();
    await loadRoster(race, horses, Date.now());
    expect(matrixFetchCount()).toBe(before);
  });

  it('keeps cached players in the roster when the cache cap is crossed', async () => {
    const org = `org-${randomUUID()}`;
    const { race, horses } = await seedLiveRace({ runners: 3, elapsedMin: 60, orgId: org });
    const rows = (n: number) => horses.slice(0, n).map((h) => habit(h.user_id!, [[540, 1020], [560, 1000]]));
    setPreparedCacheMaxForTest(1);
    try {
      await putHabitRows(org, rows(2));
      await loadRoster(race, horses, Date.now());
      await putHabitRows(org, rows(3));
      const roster = await loadRoster(race, horses, Date.now());
      expect([...roster.habits.keys()].sort()).toEqual(horses.map((h) => h.user_id!).sort());
    } finally {
      setPreparedCacheMaxForTest(500);
    }
  });

  it('ignores habit rows left over from an earlier fit', async () => {
    const org = `org-${randomUUID()}`;
    const { race, horses } = await seedLiveRace({ runners: 2, elapsedMin: 60, orgId: org, durationHours: 8 });
    const older = new Date(Date.parse(FIT_AT) - 1_800_000).toISOString();
    const newer = FIT_AT;
    for (const id of ['stale', 'fresh']) {
      await putStableHorse(id, {
        stable_horse_id: `sh-${id}`, name: id, colors: { body: '#123456', mane: '#000', tail: '#000', saddle: '#fff' },
        xp: 0, recent_paces: [20_000], created_at: new Date().toISOString(),
      } as any);
    }
    await putHabitRows(org, [
      habit('stale', [[600, 1000], [620, 1020]], { stable_horse_id: 'sh-stale', last_updated: older }),
      habit('fresh', [[600, 1000], [620, 1020]], { stable_horse_id: 'sh-fresh', last_updated: newer }),
      habit(ORG_HABIT_ID, [[540, 1020], [560, 1000]], { last_updated: newer }),
    ]);
    const roster = await loadRoster(race, horses, Date.now());
    expect(roster.notJoined.map((p) => p.user_id)).toEqual(['fresh']);
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

  it('prices joined runners with an empty roster when the roster load throws', async () => {
    const org = `org-${randomUUID()}`;
    const { race, horses } = await seedLiveRace({ runners: 3, elapsedMin: 60, orgId: org });
    await putHabitRows(org, [habit(horses[0]!.user_id!, [[540, 1020], [560, 1000]], { habit_matrix_data: 'AAAA' })]);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const snap = await ensureSnapshot(race, horses, Date.now());
    expect(err).toHaveBeenCalledWith('roster load failed', expect.objectContaining({ race_id: race.race_id }));
    err.mockRestore();
    expect(snap!.prices).toHaveLength(3);
    expect(snap!.not_joined).toEqual([]);
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
