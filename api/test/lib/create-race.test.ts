import { describe, it, expect } from 'vitest';
import { createRace } from '../../src/lib/create-race.js';
import { getRaceByJoinCode } from '../../src/db/races.js';

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
