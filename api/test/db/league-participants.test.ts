import { describe, it, expect } from 'vitest';
import {
  listSeasonParticipants, ensureStanding, addStandingPointsForRound, listSeasonStandings,
} from '../../src/db/league-standings.js';
import type { LeagueStanding } from '@token-derby/shared';

const oid = () => `o-lp-${Math.random().toString(36).slice(2)}`;

function standing(over: Partial<LeagueStanding>): LeagueStanding {
  return {
    org_id: over.org_id!, season: 1, division: 3, stable_horse_id: over.stable_horse_id ?? 'sh1',
    horse_name: 'Bolt', user_id: 'u1', user_name: 'Alice', points: 0, season_tokens: 0,
    entered_at: '2026-07-07T00:00:00.000Z', ...over,
  };
}

describe('listSeasonParticipants', () => {
  it('includes a horse whose scored_rounds set contains one round', async () => {
    const org = oid();
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'raced' }));
    await addStandingPointsForRound(org, 1, 3, 'raced', 5, 1000, 1);

    const participants = await listSeasonParticipants(org, 1);
    expect(participants.has('raced')).toBe(true);
  });

  it('excludes a horse that was seeded but never raced', async () => {
    const org = oid();
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'idle' }));

    const participants = await listSeasonParticipants(org, 1);
    expect(participants.has('idle')).toBe(false);
  });

  it('includes a horse with points: 0 and a non-empty scored_rounds (pins against the points > 0 proxy)', async () => {
    const org = oid();
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'zero-points' }));
    // 0 points awarded, but the round is recorded as scored.
    await addStandingPointsForRound(org, 1, 3, 'zero-points', 0, 0, 1);

    const [row] = await listSeasonStandings(org, 1);
    expect(row).toMatchObject({ points: 0 });

    const participants = await listSeasonParticipants(org, 1);
    expect(participants.has('zero-points')).toBe(true);
  });

  it('excludes a horse with points: 5 and empty scored_rounds (pins against the season_tokens/points proxies)', async () => {
    const org = oid();
    // Seed a standing that already carries points, but never route it through
    // addStandingPointsForRound, so scored_rounds stays absent/empty.
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'phantom-points', points: 5, season_tokens: 500 }));

    const participants = await listSeasonParticipants(org, 1);
    expect(participants.has('phantom-points')).toBe(false);
  });

  it('returns an empty set for a season with no standings', async () => {
    const participants = await listSeasonParticipants(oid(), 1);
    expect(participants).toEqual(new Set());
  });

  it('does not include participants from a different season', async () => {
    const org = oid();
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'season-1', season: 1 }));
    await addStandingPointsForRound(org, 1, 3, 'season-1', 5, 1000, 1);
    await ensureStanding(standing({ org_id: org, stable_horse_id: 'season-2', season: 2 }));
    await addStandingPointsForRound(org, 2, 3, 'season-2', 5, 1000, 1);

    const participants = await listSeasonParticipants(org, 1);
    expect(participants.has('season-1')).toBe(true);
    expect(participants.has('season-2')).toBe(false);
  });

  it('does not include participants from a different org', async () => {
    const orgA = oid();
    const orgB = oid();
    await ensureStanding(standing({ org_id: orgA, stable_horse_id: 'org-a-horse' }));
    await addStandingPointsForRound(orgA, 1, 3, 'org-a-horse', 5, 1000, 1);
    await ensureStanding(standing({ org_id: orgB, stable_horse_id: 'org-b-horse' }));
    await addStandingPointsForRound(orgB, 1, 3, 'org-b-horse', 5, 1000, 1);

    const participantsA = await listSeasonParticipants(orgA, 1);
    expect(participantsA.has('org-a-horse')).toBe(true);
    expect(participantsA.has('org-b-horse')).toBe(false);
  });
});
