import type { League, RaceSchedule } from '@token-derby/shared';
import {
  currentMode, leagueError, leagueFormFrom, leagueRequest, scheduleError, scheduleFormFrom, scheduleRequest, scheduleSummary,
} from './racing-model';

const stamp = { org_id: 'o', created_at: '', creator_user_id: 'u1', creator_user_name: 'Omar' };
const SCHEDULE = { weekdays: [1, 2, 3, 4, 5], start_local: '09:00', end_local: '17:30', tz: 'Europe/London', ...stamp } as RaceSchedule;
const LEAGUE = {
  ...SCHEDULE, divisions: [{ name: 'Premier', cap: 8 }, { name: 'Two', cap: 8 }], boundaries: [2], races_per_season: 10, current_season: 2, status: 'active',
} as League;

describe('racing model', () => {
  it('works out the current mode', () => {
    expect(currentMode(null, null)).toBe('off');
    expect(currentMode(SCHEDULE, null)).toBe('schedule');
    expect(currentMode(null, LEAGUE)).toBe('league');
    expect(currentMode(SCHEDULE, LEAGUE)).toBe('league');
  });

  it('starts a new schedule on weekdays in working hours, in your time zone', () => {
    const f = scheduleFormFrom(null, 'America/New_York');
    expect(f).toEqual({ weekdays: [1, 2, 3, 4, 5], start_local: '09:00', end_local: '17:30', tz: 'America/New_York', race_name: '', max_participants: null });
  });

  it('starts a new league with three divisions', () => {
    const f = leagueFormFrom(null, '');
    expect(f.divisions.map((d) => d.name)).toEqual(['Premier', 'Championship', 'League One']);
    expect(f.boundaries).toEqual([2, 2]);
    expect(f.races_per_season).toBe(8);
    expect(f.tz).toBe('Europe/London');
  });

  it('opens a running league on its edits waiting for next season', () => {
    const f = leagueFormFrom({ ...LEAGUE, pending_structural: { divisions: [{ name: 'Only', cap: 9 }], boundaries: [], races_per_season: 12 } }, '');
    expect(f.divisions).toEqual([{ name: 'Only', cap: 9 }]);
    expect(f.boundaries).toEqual([]);
    expect(f.races_per_season).toBe(12);
  });

  it.each([
    [{ weekdays: [] }, 'Pick at least one day.'],
    [{ start_local: '17:00', end_local: '09:00' }, 'Races must finish after they start.'],
    [{ max_participants: 0 }, 'Max runners must be at least 1.'],
  ])('checks a schedule: %o', (patch, message) => {
    expect(scheduleError({ ...scheduleFormFrom(SCHEDULE, ''), ...patch })).toBe(message);
  });

  it('checks a league with the shared rules', () => {
    const f = leagueFormFrom(LEAGUE, '');
    expect(leagueError({ ...f, divisions: [{ name: '', cap: 8 }, { name: 'Two', cap: 8 }] })).toBe('Division 1 name must be 1–40 characters');
    expect(leagueError(f)).toBeNull();
  });

  it('sums up a schedule in plain words', () => {
    expect(scheduleSummary(scheduleFormFrom(SCHEDULE, ''))).toBe('Monday to Friday, 09:00–17:30 London time.');
    expect(scheduleSummary({ ...scheduleFormFrom(SCHEDULE, ''), weekdays: [1, 3, 5], tz: 'America/New_York' })).toBe('Monday, Wednesday and Friday, 09:00–17:30 New York time.');
    expect(scheduleSummary({ ...scheduleFormFrom(SCHEDULE, ''), weekdays: [6] })).toBe('Saturday, 09:00–17:30 London time.');
  });

  it('leaves out an empty race name and no max', () => {
    const body = scheduleRequest(scheduleFormFrom(SCHEDULE, ''));
    expect('race_name' in body).toBe(false);
    expect('max_participants' in body).toBe(false);
    expect(leagueRequest(leagueFormFrom(LEAGUE, '')).divisions).toHaveLength(2);
  });
});
