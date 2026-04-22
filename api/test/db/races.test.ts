import { describe, it, expect } from 'vitest';
import { putRace, getRaceById, getRaceByJoinCode, getRaceByAdminCode, setRaceEnded } from '../../src/db/races.js';
import type { Race } from '@token-derby/shared';

function makeRace(overrides: Partial<Race> = {}): Race {
  return {
    race_id: `r-${Math.random().toString(36).slice(2)}`,
    name: 'Test Race',
    start_time: '2026-04-22T09:00:00Z',
    end_time: '2026-04-22T17:00:00Z',
    tz: 'Europe/London',
    max_participants: 30,
    join_code: `J${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('races db', () => {
  it('puts and reads a race by id', async () => {
    const race = makeRace();
    await putRace(race, 'admin-secret-123');
    const fetched = await getRaceById(race.race_id);
    expect(fetched).toEqual(race);
  });

  it('finds a race by join code', async () => {
    const race = makeRace();
    await putRace(race, 'admin-secret-456');
    const fetched = await getRaceByJoinCode(race.join_code);
    expect(fetched?.race_id).toBe(race.race_id);
  });

  it('finds a race by admin code', async () => {
    const race = makeRace();
    const admin = 'admin-secret-789';
    await putRace(race, admin);
    const fetched = await getRaceByAdminCode(admin);
    expect(fetched?.race_id).toBe(race.race_id);
  });

  it('returns null for unknown codes', async () => {
    expect(await getRaceByJoinCode('NOPE99')).toBe(null);
    expect(await getRaceByAdminCode('no-admin')).toBe(null);
  });

  it('sets ended_at on a race', async () => {
    const race = makeRace();
    await putRace(race, 'admin-x');
    const now = new Date().toISOString();
    await setRaceEnded(race.race_id, now);
    const fetched = await getRaceById(race.race_id);
    expect(fetched?.ended_at).toBe(now);
  });
});
