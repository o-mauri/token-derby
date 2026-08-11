import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createRace } from '../../src/lib/create-race.js';
import { getRaceByJoinCode, setRaceEndedIfAbsent } from '../../src/db/races.js';
import { putHorse } from '../../src/db/horses.js';

// Minimal race-horse row: expected_field only cares that the row exists.
async function seedAttendance(race_id: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const now = new Date().toISOString();
    await putHorse(race_id, {
      horse_id: `h-${randomUUID()}`,
      stable_horse_id: `sh-${randomUUID()}`,
      name: `Runner${i}`,
      colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' },
      current_tokens: 0,
      last_heartbeat: now,
      joined_at: now,
      user_id: `u-${randomUUID()}`,
      user_name: `Runner${i}`,
      xp: 0,
    }, `tok-${randomUUID()}`);
  }
}

describe('createRace league tagging', () => {
  it('stamps league_id/season/round when a league is passed', async () => {
    const res = await createRace({
      name: 'Anthropic League (League Race (1/8))',
      start_time: '2026-07-07T09:00:00.000Z',
      end_time: '2026-07-07T17:00:00.000Z',
      tz: 'UTC',
      creator_user_id: 'u1',
      creator_user_name: 'Alice',
      league: { league_id: 'org-1', season: 1, round: 1 },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const race = await getRaceByJoinCode(res.join_code);
    expect(race).toMatchObject({ league_id: 'org-1', league_season: 1, league_round: 1 });
  });

  it('omits league tags for a normal race', async () => {
    const res = await createRace({
      name: 'Plain', start_time: '2026-07-07T09:00:00.000Z', end_time: '2026-07-07T17:00:00.000Z',
      tz: 'UTC', creator_user_id: 'u1', creator_user_name: 'Alice',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const race = await getRaceByJoinCode(res.join_code);
    expect(race?.league_id).toBeUndefined();
  });
});

describe('createRace expected_field', () => {
  it('stamps the mean ACTUAL ATTENDANCE of the org\'s finished races, not their capacity', async () => {
    const org = { org_id: `org-${randomUUID()}`, org_name: 'Field Org' };
    // Every race shares a generous cap far above real turnout — if expected_field
    // tracked max_participants instead of attendance, it would land near 30, not ~4.
    const CAP = 30;

    const first = await createRace({
      name: 'R1', start_time: '2026-01-01T09:00:00.000Z', end_time: '2026-01-01T10:00:00.000Z',
      tz: 'UTC', creator_user_id: 'u1', creator_user_name: 'Alice', max_participants: CAP, org,
    });
    const second = await createRace({
      name: 'R2', start_time: '2026-01-02T09:00:00.000Z', end_time: '2026-01-02T10:00:00.000Z',
      tz: 'UTC', creator_user_id: 'u1', creator_user_name: 'Alice', max_participants: CAP, org,
    });
    if (!first.ok || !second.ok) throw new Error('setup failed');
    await seedAttendance(first.race_id, 4);
    await seedAttendance(second.race_id, 6);
    await setRaceEndedIfAbsent(first.race_id, '2026-01-01T10:00:00.000Z');
    await setRaceEndedIfAbsent(second.race_id, '2026-01-02T10:00:00.000Z');

    const third = await createRace({
      name: 'R3', start_time: '2026-01-03T09:00:00.000Z', end_time: '2026-01-03T10:00:00.000Z',
      tz: 'UTC', creator_user_id: 'u1', creator_user_name: 'Alice', max_participants: CAP, org,
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    const race = await getRaceByJoinCode(third.join_code);
    expect(race?.expected_field).toBe(5);   // round((4 + 6) / 2), nowhere near the 30 cap
  });

  it('ignores races that never finished (end_time in the past is not the finished signal)', async () => {
    const org = { org_id: `org-${randomUUID()}`, org_name: 'Unfinished Org' };
    const first = await createRace({
      name: 'R1', start_time: '2026-01-01T09:00:00.000Z', end_time: '2026-01-01T10:00:00.000Z',
      tz: 'UTC', creator_user_id: 'u1', creator_user_name: 'Alice', org,
    });
    if (!first.ok) throw new Error('setup failed');
    await seedAttendance(first.race_id, 12);   // never marked ended_at

    const second = await createRace({
      name: 'R2', start_time: '2026-01-02T09:00:00.000Z', end_time: '2026-01-02T10:00:00.000Z',
      tz: 'UTC', creator_user_id: 'u1', creator_user_name: 'Alice', org,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const race = await getRaceByJoinCode(second.join_code);
    expect(race?.expected_field).toBeUndefined();
  });

  it('leaves expected_field unset for an org\'s first race', async () => {
    const org = { org_id: `org-${randomUUID()}`, org_name: 'Fresh Org' };
    const res = await createRace({
      name: 'R1', start_time: '2026-01-01T09:00:00.000Z', end_time: '2026-01-01T10:00:00.000Z',
      tz: 'UTC', creator_user_id: 'u1', creator_user_name: 'Alice', org,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const race = await getRaceByJoinCode(res.join_code);
    expect(race?.expected_field).toBeUndefined();
  });

  it('leaves expected_field unset for a race with no org', async () => {
    const res = await createRace({
      name: 'Plain', start_time: '2026-01-01T09:00:00.000Z', end_time: '2026-01-01T10:00:00.000Z',
      tz: 'UTC', creator_user_id: 'u1', creator_user_name: 'Alice',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const race = await getRaceByJoinCode(res.join_code);
    expect(race?.expected_field).toBeUndefined();
  });
});
