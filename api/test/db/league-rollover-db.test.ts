import { describe, it, expect } from 'vitest';
import { putLeague, getLeague, commitRollover } from '../../src/db/leagues.js';
import { ensureLeagueSeason, getLeagueSeason, stampFinalFixtureEnd, markSeasonComplete } from '../../src/db/league-seasons.js';
import { ensureStanding, listSeasonStandings, tryMarkPrizeAwarded } from '../../src/db/league-standings.js';
import { putSeasonResultIfAbsent, getSeasonResult } from '../../src/db/league-results.js';
import type { League, LeagueStanding, LeagueSeasonResult } from '@token-derby/shared';

function league(org_id: string, over: Partial<League> = {}): League {
  return {
    org_id, divisions: [{ name: 'D1', cap: 2 }, { name: 'D2', cap: 2 }, { name: 'D3', cap: 9 }], boundaries: [1, 1],
    races_per_season: 4, weekdays: [1], start_local: '09:00', end_local: '17:00', tz: 'UTC',
    current_season: 1, status: 'active', created_at: 'c', creator_user_id: 'u', creator_user_name: 'C', ...over,
  };
}
function standing(org_id: string, over: Partial<LeagueStanding>): LeagueStanding {
  return { org_id, season: 1, division: 1, stable_horse_id: 's', horse_name: 'H', user_id: 'u', user_name: 'U', points: 0, season_tokens: 0, entered_at: '2026-07-07T00:00:00Z', ...over };
}

describe('stampFinalFixtureEnd', () => {
  it('sets final_fixture_end on the season row', async () => {
    const org = 'RollDbA';
    await ensureLeagueSeason(org, 1);
    await stampFinalFixtureEnd(org, 1, '2026-07-20T17:00:00.000Z');
    expect((await getLeagueSeason(org, 1))?.final_fixture_end).toBe('2026-07-20T17:00:00.000Z');
  });
});

describe('tryMarkPrizeAwarded', () => {
  it('returns true the first time and false on repeat (idempotency mark)', async () => {
    const org = 'RollDbB';
    await ensureStanding(standing(org, { division: 1, stable_horse_id: 's1' }));
    expect(await tryMarkPrizeAwarded(org, 1, 1, 's1')).toBe(true);
    expect(await tryMarkPrizeAwarded(org, 1, 1, 's1')).toBe(false);
    const row = (await listSeasonStandings(org, 1)).find(r => r.stable_horse_id === 's1');
    expect(row?.prize_awarded).toBe(true);
  });
  it('returns false when the standing row does not exist', async () => {
    expect(await tryMarkPrizeAwarded('RollDbB', 1, 1, 'ghost')).toBe(false);
  });
});

describe('season result', () => {
  it('put-if-absent then get; a second put does not overwrite', async () => {
    const org = 'RollDbC';
    const r: LeagueSeasonResult = {
      org_id: org, season: 1, champion: { stable_horse_id: 's1', horse_name: 'Bolt', user_name: 'U', points: 12 },
      division_champions: [{ division: 1, name: 'D1', stable_horse_id: 's1', horse_name: 'Bolt' }],
      promoted: ['s2'], relegated: ['s3'], division_names: ['D1', 'D2', 'D3'], finished_at: '2026-07-20T17:00:00Z',
    };
    await putSeasonResultIfAbsent(r);
    await putSeasonResultIfAbsent({ ...r, champion: null }); // ignored
    expect((await getSeasonResult(org, 1))?.champion?.horse_name).toBe('Bolt');
  });
});

describe('commitRollover', () => {
  it('bumps current_season and applies+clears pending_structural, guarded on the from-season', async () => {
    const org = 'RollDbD';
    await putLeague(league(org, { current_season: 1, pending_structural: { boundaries: [2, 2], races_per_season: 6 } }));
    expect(await commitRollover(org, 1, { boundaries: [2, 2], races_per_season: 6 })).toBe(true);
    const l = await getLeague(org);
    expect(l?.current_season).toBe(2);
    expect(l?.boundaries).toEqual([2, 2]);
    expect(l?.races_per_season).toBe(6);
    expect(l?.pending_structural).toBeUndefined();
    // a stale second commit for season 1 is refused
    expect(await commitRollover(org, 1, null)).toBe(false);
  });
  it('bumps season with no structural change when applied is null', async () => {
    const org = 'RollDbE';
    await putLeague(league(org, { current_season: 3 }));
    expect(await commitRollover(org, 3, null)).toBe(true);
    expect((await getLeague(org))?.current_season).toBe(4);
  });
});
