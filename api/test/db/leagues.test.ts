import { describe, it, expect } from 'vitest';
import { putLeague, getLeague, deleteLeague, listAllLeagues } from '../../src/db/leagues.js';
import type { League } from '@token-derby/shared';

function league(org_id: string): League {
  return {
    org_id,
    divisions: 3,
    racers_per_division: 10,
    races_per_season: 8,
    promote_relegate_count: 2,
    weekdays: [1, 2, 3, 4, 5],
    start_local: '09:00',
    end_local: '17:30',
    tz: 'UTC',
    current_season: 1,
    status: 'active',
    created_at: '2026-07-07T00:00:00.000Z',
    creator_user_id: 'u1',
    creator_user_name: 'Alice',
  };
}

describe('leagues db', () => {
  it('round-trips a league by org', async () => {
    await putLeague(league('org-1'));
    const got = await getLeague('org-1');
    expect(got).toMatchObject({ org_id: 'org-1', divisions: 3, current_season: 1, status: 'active' });
    // internal storage keys are stripped
    expect((got as any).pk).toBeUndefined();
    expect((got as any).league_marker).toBeUndefined();
  });

  it('returns null for an org with no league', async () => {
    expect(await getLeague('org-none')).toBeNull();
  });

  it('deletes a league', async () => {
    await putLeague(league('org-2'));
    await deleteLeague('org-2');
    expect(await getLeague('org-2')).toBeNull();
  });
});

describe('listAllLeagues', () => {
  it('returns every league via the marker index', async () => {
    await putLeague(league('all-1'));
    await putLeague(league('all-2'));
    const ids = (await listAllLeagues()).map(l => l.org_id);
    expect(ids).toContain('all-1');
    expect(ids).toContain('all-2');
  });
});
