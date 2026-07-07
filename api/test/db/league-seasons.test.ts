import { describe, it, expect } from 'vitest';
import { getLeagueSeason, ensureLeagueSeason, tryClaimLeagueFixture } from '../../src/db/league-seasons.js';

const oid = () => `o-${Math.random().toString(36).slice(2)}`;

describe('league-seasons db', () => {
  it('ensureLeagueSeason creates an active season at 0 fixtures, idempotently', async () => {
    const org = oid();
    await ensureLeagueSeason(org, 1);
    await ensureLeagueSeason(org, 1); // no-op second call
    const s = await getLeagueSeason(org, 1);
    expect(s).toMatchObject({ org_id: org, season: 1, status: 'active', fixtures_materialised: 0 });
  });

  it('claims a fixture: increments the counter, stamps the date, returns the round', async () => {
    const org = oid();
    await ensureLeagueSeason(org, 1);
    const round = await tryClaimLeagueFixture(org, 1, '2026-07-07', 8);
    expect(round).toBe(1);
    const s = await getLeagueSeason(org, 1);
    expect(s?.fixtures_materialised).toBe(1);
    expect(s?.last_materialised_date).toBe('2026-07-07');
  });

  it('a second claim on the same local day returns null (idempotent per day)', async () => {
    const org = oid();
    await ensureLeagueSeason(org, 1);
    expect(await tryClaimLeagueFixture(org, 1, '2026-07-07', 8)).toBe(1);
    expect(await tryClaimLeagueFixture(org, 1, '2026-07-07', 8)).toBeNull();
  });

  it('claims across different days increment the round', async () => {
    const org = oid();
    await ensureLeagueSeason(org, 1);
    expect(await tryClaimLeagueFixture(org, 1, '2026-07-07', 8)).toBe(1);
    expect(await tryClaimLeagueFixture(org, 1, '2026-07-08', 8)).toBe(2);
  });

  it('returns null once the season is full (fixtures_materialised == cap)', async () => {
    const org = oid();
    await ensureLeagueSeason(org, 1);
    // cap of 2: two claims on distinct days succeed, the third is refused
    expect(await tryClaimLeagueFixture(org, 1, '2026-07-07', 2)).toBe(1);
    expect(await tryClaimLeagueFixture(org, 1, '2026-07-08', 2)).toBe(2);
    expect(await tryClaimLeagueFixture(org, 1, '2026-07-09', 2)).toBeNull();
  });

  it('claim on a missing season row returns null (no row to claim)', async () => {
    expect(await tryClaimLeagueFixture(oid(), 1, '2026-07-07', 8)).toBeNull();
  });
});
