import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Horse, Race } from '@token-derby/shared';
import { putRace } from '../../src/db/races.js';
import { putHorse } from '../../src/db/horses.js';
import { listHabitSummaries, getHabitMatrices, ORG_HABIT_ID } from '../../src/db/habits.js';
import { spanOf, habitsAreFresh, fitOrgHabits, ensureHabits } from '../../src/lib/fit-habits.js';

const DAY = 86_400_000;

async function finishedRace(org_id: string, endedAgoDays: number, players: Array<{ user: string; first?: string; last?: string }>, tz = 'UTC') {
  const ended = new Date(Date.now() - endedAgoDays * DAY);
  const race: Race = {
    race_id: `fh-${randomUUID()}`, name: 'Fit race', start_time: new Date(ended.getTime() - 9 * 3_600_000).toISOString(),
    end_time: ended.toISOString(), ended_at: ended.toISOString(), tz, max_participants: 30,
    join_code: `F${randomUUID().slice(0, 6).toUpperCase()}`, created_at: ended.toISOString(), org_id,
  } as Race;
  await putRace(race, `admin-${race.race_id}`);
  const day = ended.toISOString().slice(0, 10);
  for (const p of players) {
    const horse: Horse = {
      horse_id: `h-${randomUUID()}`, stable_horse_id: `sh-${p.user}`, name: p.user,
      colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' }, current_tokens: 1000,
      last_heartbeat: ended.toISOString(), joined_at: `${day}T${p.first ?? '09:00'}:00.000Z`, user_id: p.user, user_name: p.user, xp: 0,
      ...(p.first && p.last ? { first_scored_at: `${day}T${p.first}:00.000Z`, last_scored_at: `${day}T${p.last}:00.000Z` } : {}),
    };
    await putHorse(race.race_id, horse, `tok-${horse.horse_id}`);
  }
  return race;
}

describe('spanOf', () => {
  it('converts both ends to local clock minutes', () => {
    expect(spanOf({ first_scored_at: '2026-07-01T08:00:00Z', last_scored_at: '2026-07-01T15:30:00Z' }, 'Europe/London'))
      .toEqual({ arrival: 540, departure: 990 });
  });
  it('clips a span that runs past local midnight', () => {
    expect(spanOf({ first_scored_at: '2026-12-01T22:00:00Z', last_scored_at: '2026-12-02T01:00:00Z' }, 'UTC'))
      .toEqual({ arrival: 1320, departure: 1440 });
  });
  it('is null without both ends', () => {
    expect(spanOf({ first_scored_at: '2026-07-01T08:00:00Z' }, 'UTC')).toBeNull();
  });
});

describe('fitOrgHabits', () => {
  it('writes a row per player with spans, plus the org fallback', async () => {
    const org = `org-${randomUUID()}`;
    await finishedRace(org, 1, [{ user: 'alice', first: '09:00', last: '17:00' }, { user: 'bob', first: '13:00', last: '18:00' }]);
    await finishedRace(org, 2, [{ user: 'alice', first: '09:10', last: '16:40' }]);
    await finishedRace(org, 20, [{ user: 'carol', first: '09:00', last: '17:00' }]);   // outside 14 days
    await fitOrgHabits(org, Date.now());
    const rows = await listHabitSummaries(org);
    expect(rows.map((r) => r.user_id).sort()).toEqual([ORG_HABIT_ID, 'alice', 'bob']);
    const alice = rows.find((r) => r.user_id === 'alice')!;
    expect(alice.login_propensity).toBeCloseTo(3 / 4, 10);   // (2 + 1) / (2 + 2)
    expect(alice.stable_horse_id).toBe('sh-alice');
    expect(rows.find((r) => r.user_id === ORG_HABIT_ID)!.is_debutant).toBe(true);
    const m = await getHabitMatrices(org, ['alice']);
    expect(m.get('alice')!.length).toBeGreaterThan(70_000);
  });

  it('counts only races with span data towards login propensity', async () => {
    const org = `org-${randomUUID()}`;
    await finishedRace(org, 1, [{ user: 'alice', first: '09:00', last: '17:00' }]);
    await finishedRace(org, 2, [{ user: 'alice' }]);
    await finishedRace(org, 3, [{ user: 'bob' }]);
    await fitOrgHabits(org, Date.now());
    const alice = (await listHabitSummaries(org)).find((r) => r.user_id === 'alice')!;
    expect(alice.login_propensity).toBeCloseTo(2 / 3, 10);   // (1 + 1) / (1 + 2)
  });

  it('skips a race with an invalid timezone and still fits the rest', async () => {
    const org = `org-${randomUUID()}`;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await finishedRace(org, 1, [{ user: 'alice', first: '09:00', last: '17:00' }], 'Not/AZone');
    await finishedRace(org, 2, [{ user: 'bob', first: '10:00', last: '16:00' }]);
    await fitOrgHabits(org, Date.now());
    warn.mockRestore();
    const ids = (await listHabitSummaries(org)).map((r) => r.user_id);
    expect(ids).toContain('bob');
    expect(ids).not.toContain('alice');
  });

  it('writes nothing for an org with no finished races in the window', async () => {
    const org = `org-${randomUUID()}`;
    await fitOrgHabits(org, Date.now());
    expect(await listHabitSummaries(org)).toEqual([]);
  });
});

describe('habitsAreFresh', () => {
  const race = (ended_at: string) => ({ ended_at } as Race);
  it('is fresh when the fit is newer than the latest finished race', () => {
    expect(habitsAreFresh([{ user_id: ORG_HABIT_ID, last_updated: '2026-10-02T00:00:00Z' } as any], [race('2026-10-01T17:00:00Z')])).toBe(true);
  });
  it('is stale when a race has finished since', () => {
    expect(habitsAreFresh([{ user_id: ORG_HABIT_ID, last_updated: '2026-10-01T00:00:00Z' } as any], [race('2026-10-01T17:00:00Z')])).toBe(false);
  });
  it('is stale with no fit when races exist, and fresh when nothing has finished', () => {
    expect(habitsAreFresh([], [race('2026-10-01T17:00:00Z')])).toBe(false);
    expect(habitsAreFresh([], [])).toBe(true);
  });
});

describe('ensureHabits', () => {
  it('fits once, then reuses the fresh fit', async () => {
    const org = `org-${randomUUID()}`;
    await finishedRace(org, 1, [{ user: 'dan', first: '09:00', last: '17:00' }]);
    const first = await ensureHabits(org, Date.now());
    const second = await ensureHabits(org, Date.now());
    expect(first.map((r) => r.user_id).sort()).toEqual([ORG_HABIT_ID, 'dan']);
    expect(second.find((r) => r.user_id === 'dan')!.last_updated).toBe(first.find((r) => r.user_id === 'dan')!.last_updated);
  });
});
