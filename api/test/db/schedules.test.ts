import { describe, it, expect } from 'vitest';
import { putSchedule, getSchedule, deleteSchedule, listAllSchedules, tryClaimMaterialised } from '../../src/db/schedules.js';
import type { RaceSchedule } from '@token-derby/shared';

const oid = () => `o-${Math.random().toString(36).slice(2)}`;

function sched(org_id: string): RaceSchedule {
  return {
    org_id,
    weekdays: [1, 2, 3, 4, 5],
    start_local: '09:00',
    end_local: '17:30',
    tz: 'Europe/London',
    created_at: '2024-07-01T00:00:00.000Z',
    creator_user_id: 'u1',
    creator_user_name: 'Alice',
  };
}

describe('schedules db', () => {
  it('puts and gets a schedule', async () => {
    const id = oid();
    await putSchedule(sched(id));
    const got = await getSchedule(id);
    expect(got?.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(got?.tz).toBe('Europe/London');
    // internal marker / keys are not surfaced
    expect((got as any).schedule_marker).toBeUndefined();
    expect((got as any).pk).toBeUndefined();
  });

  it('upserts (one schedule per org)', async () => {
    const id = oid();
    await putSchedule(sched(id));
    await putSchedule({ ...sched(id), start_local: '08:00' });
    const got = await getSchedule(id);
    expect(got?.start_local).toBe('08:00');
  });

  it('deletes a schedule', async () => {
    const id = oid();
    await putSchedule(sched(id));
    await deleteSchedule(id);
    expect(await getSchedule(id)).toBeNull();
  });

  it('listAllSchedules returns put schedules', async () => {
    const id = oid();
    await putSchedule(sched(id));
    const all = await listAllSchedules();
    expect(all.some((s) => s.org_id === id)).toBe(true);
  });

  it('tryClaimMaterialised: true once per date, then false', async () => {
    const id = oid();
    await putSchedule(sched(id));
    expect(await tryClaimMaterialised(id, '2024-07-01')).toBe(true);
    expect(await tryClaimMaterialised(id, '2024-07-01')).toBe(false);
    expect(await tryClaimMaterialised(id, '2024-07-02')).toBe(true);
  });

  it('tryClaimMaterialised: false for a non-existent schedule', async () => {
    expect(await tryClaimMaterialised(oid(), '2024-07-01')).toBe(false);
  });
});
