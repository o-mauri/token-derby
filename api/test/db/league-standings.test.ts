import { describe, it, expect } from 'vitest';
import { listSeasonStandings, ensureStanding, addStandingPointsForRound } from '../../src/db/league-standings.js';
import type { LeagueStanding } from '@token-derby/shared';

const oid = () => `o-${Math.random().toString(36).slice(2)}`;

function standing(over: Partial<LeagueStanding>): LeagueStanding {
  return {
    org_id: over.org_id!, season: 1, division: 3, stable_horse_id: over.stable_horse_id ?? 'sh1',
    horse_name: 'Bolt', user_id: 'u1', user_name: 'Alice', points: 0, season_tokens: 0,
    entered_at: '2026-07-07T00:00:00.000Z', ...over,
  };
}

describe('league-standings db', () => {
  it('ensureStanding creates a row idempotently and listSeasonStandings returns it', async () => {
    const org = oid();
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'a' }));
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'a', points: 999 })); // no-op (exists)
    const rows = await listSeasonStandings(org, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stable_horse_id: 'a', division: 3, points: 0 });
  });

  it('lists standings across multiple divisions for a season', async () => {
    const org = oid();
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'a', division: 1 }));
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'b', division: 2 }));
    const rows = await listSeasonStandings(org, 1);
    expect(rows.map(r => r.division).sort()).toEqual([1, 2]);
  });

  it('addStandingPointsForRound increments points+tokens for a round', async () => {
    const org = oid();
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'a', division: 3 }));
    await addStandingPointsForRound(org, 1, 3, 'a', 5, 1000, 1);
    const [row] = await listSeasonStandings(org, 1);
    expect(row).toMatchObject({ points: 5, season_tokens: 1000 });
    // the internal scored_rounds set is stripped from the returned shape
    expect((row as any).scored_rounds).toBeUndefined();
  });

  it('is idempotent for the same round (re-run does not double-count)', async () => {
    const org = oid();
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'a', division: 3 }));
    await addStandingPointsForRound(org, 1, 3, 'a', 5, 1000, 1);
    await addStandingPointsForRound(org, 1, 3, 'a', 5, 1000, 1); // same round → no-op
    const [row] = await listSeasonStandings(org, 1);
    expect(row.points).toBe(5);
    expect(row.season_tokens).toBe(1000);
  });

  it('accumulates across rounds', async () => {
    const org = oid();
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'a', division: 3 }));
    await addStandingPointsForRound(org, 1, 3, 'a', 5, 1000, 1);
    await addStandingPointsForRound(org, 1, 3, 'a', 3, 500, 2);
    const [row] = await listSeasonStandings(org, 1);
    expect(row).toMatchObject({ points: 8, season_tokens: 1500 });
  });

  it('applies an earlier round even when a later round scored first (order-independent)', async () => {
    const org = oid();
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'a', division: 3 }));
    await addStandingPointsForRound(org, 1, 3, 'a', 3, 500, 2);  // round 2 first
    await addStandingPointsForRound(org, 1, 3, 'a', 5, 1000, 1); // round 1 after → still applies
    const [row] = await listSeasonStandings(org, 1);
    expect(row).toMatchObject({ points: 8, season_tokens: 1500 });
    // re-applying either round is still a no-op
    await addStandingPointsForRound(org, 1, 3, 'a', 5, 1000, 1);
    await addStandingPointsForRound(org, 1, 3, 'a', 3, 500, 2);
    expect((await listSeasonStandings(org, 1))[0]).toMatchObject({ points: 8, season_tokens: 1500 });
  });
});
