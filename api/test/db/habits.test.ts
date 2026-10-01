import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  putHabitRows, listHabitSummaries, getHabitMatrices, claimHabitFit, ORG_HABIT_ID, type HabitRow,
} from '../../src/db/habits.js';

const row = (user_id: string, extra: Partial<HabitRow> = {}): HabitRow => ({
  user_id, is_debutant: user_id === ORG_HABIT_ID, login_propensity: 0.6, avg_daily_race_hours: 7.5,
  peak_activity_window: { start: '09:30', end: '12:00' }, hourly_probability_array: new Array(24).fill(0.1),
  span_count: 4, last_updated: '2026-10-01T08:00:00.000Z', habit_matrix_data: 'x'.repeat(77_120), ...extra,
});

describe('habit rows', () => {
  it('lists summaries without the matrix', async () => {
    const org = `org-${randomUUID()}`;
    await putHabitRows(org, [row('u1', { stable_horse_id: 'sh1' }), row(ORG_HABIT_ID)]);
    const list = await listHabitSummaries(org);
    expect(list.map((r) => r.user_id).sort()).toEqual([ORG_HABIT_ID, 'u1']);
    expect(list.find((r) => r.user_id === 'u1')!.stable_horse_id).toBe('sh1');
    expect((list[0] as any).habit_matrix_data).toBeUndefined();
  });

  it('batch-reads matrices by user', async () => {
    const org = `org-${randomUUID()}`;
    await putHabitRows(org, [row('u1', { habit_matrix_data: 'AAAA' }), row('u2', { habit_matrix_data: 'BBBB' })]);
    const m = await getHabitMatrices(org, ['u1', 'u2', 'missing']);
    expect(m.get('u1')).toBe('AAAA');
    expect(m.get('u2')).toBe('BBBB');
    expect(m.has('missing')).toBe(false);
  });

  it('writes more than one batch of rows', async () => {
    const org = `org-${randomUUID()}`;
    await putHabitRows(org, Array.from({ length: 30 }, (_, i) => row(`u${i}`, { habit_matrix_data: 'A' })));
    expect(await listHabitSummaries(org)).toHaveLength(30);
  });

  it('grants one fit claim at a time, and again once it goes stale', async () => {
    const org = `org-${randomUUID()}`;
    const t = Date.parse('2026-10-01T09:00:00Z');
    expect(await claimHabitFit(org, t, 120_000)).toBe(true);
    expect(await claimHabitFit(org, t + 1_000, 120_000)).toBe(false);
    expect(await claimHabitFit(org, t + 121_000, 120_000)).toBe(true);
  });

  it('does not list a claim-only org row as a habit', async () => {
    const org = `org-${randomUUID()}`;
    await claimHabitFit(org, Date.now(), 120_000);
    expect(await listHabitSummaries(org)).toEqual([]);
  });

  it('releases the fit claim when the org row is written', async () => {
    const org = `org-${randomUUID()}`;
    const t = Date.parse('2026-10-01T09:00:00Z');
    expect(await claimHabitFit(org, t, 120_000)).toBe(true);
    await putHabitRows(org, [row(ORG_HABIT_ID), row('u1')]);
    expect(await claimHabitFit(org, t, 120_000)).toBe(true);
  });

  it('lists only summary items, never matrix items', async () => {
    const org = `org-${randomUUID()}`;
    await putHabitRows(org, [row('u1'), row('u2')]);
    const list = await listHabitSummaries(org);
    expect(list).toHaveLength(2);
    expect(list.every((r) => (r as any).habit_matrix_data === undefined)).toBe(true);
  });

  it('tolerates duplicate user ids when reading matrices', async () => {
    const org = `org-${randomUUID()}`;
    await putHabitRows(org, [row('u1', { habit_matrix_data: 'AAAA' })]);
    expect((await getHabitMatrices(org, ['u1', 'u1'])).get('u1')).toBe('AAAA');
  });
});
