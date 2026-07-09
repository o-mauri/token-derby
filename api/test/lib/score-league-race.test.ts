import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { scoreLeagueRace } from '../../src/lib/score-league-race.js';
import { putLeague } from '../../src/db/leagues.js';
import { listSeasonStandings, ensureStanding } from '../../src/db/league-standings.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';
import type { League, Race, Horse } from '@token-derby/shared';

const H = (u: TestUser) => ({ 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': u.user_id, 'x-user-token': u.secret_token });

async function createOrg(user: TestUser, name: string): Promise<{ org_id: string; join_token: string }> {
  const ev: any = { version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '', headers: H(user), requestContext: {}, body: JSON.stringify({ name }), isBase64Encoded: false };
  const res: any = await createOrgHandler(ev as APIGatewayProxyEventV2);
  const body = JSON.parse(res.body);
  return { org_id: body.org_id, join_token: body.org_join_token ?? body.join_token };
}

function baseLeague(org_id: string, over: Partial<League> = {}): League {
  return {
    org_id,
    divisions: [{ name: 'Div 1', cap: 10 }, { name: 'Div 2', cap: 10 }, { name: 'Div 3', cap: 10 }],
    boundaries: [2, 2],
    races_per_season: 8, weekdays: [1], start_local: '09:00', end_local: '17:00', tz: 'UTC',
    current_season: 1, status: 'active', created_at: 'c', creator_user_id: 'u', creator_user_name: 'C',
    ...over,
  };
}

function horse(over: Partial<Horse>): Horse {
  return {
    horse_id: over.horse_id ?? 'h', stable_horse_id: over.stable_horse_id ?? 'sh', name: over.name ?? 'Bolt',
    colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
    current_tokens: over.final_tokens ?? 0, last_heartbeat: 'x', joined_at: over.joined_at ?? '2026-07-07T09:00:00.000Z',
    final_tokens: over.final_tokens ?? 0, user_id: over.user_id ?? 'u', user_name: over.user_name ?? 'U', xp: 0,
  } as Horse;
}

function leagueRace(org_id: string, round = 1): Race {
  return {
    race_id: `r-${Math.random().toString(36).slice(2)}`, name: 'L', start_time: '2026-07-07T09:00:00.000Z',
    end_time: '2026-07-07T17:00:00.000Z', tz: 'UTC', max_participants: 30, join_code: 'ABC123', created_at: 'c',
    org_id, organisation_name: 'Org', league_id: org_id, league_season: 1, league_round: round,
  } as Race;
}

describe('scoreLeagueRace', () => {
  it('scores members in the bottom division by linear points (season 1 single pool)', async () => {
    const owner = await makeUser('ScoreOwner');
    const { org_id } = await createOrg(owner, 'ScoreOrg1');
    await putLeague(baseLeague(org_id)); // divisions.length === 3 → bottom division is 3
    // owner + one more member each field a horse
    const h1 = horse({ horse_id: 'h1', stable_horse_id: 's1', user_id: owner.user_id, user_name: 'ScoreOwner', final_tokens: 900, joined_at: '2026-07-07T09:00:00Z' });
    const h2 = horse({ horse_id: 'h2', stable_horse_id: 's2', user_id: owner.user_id, user_name: 'ScoreOwner', final_tokens: 500, joined_at: '2026-07-07T09:01:00Z' });
    // NOTE: both horses belong to the org owner (a member); that's fine for scoring.
    await scoreLeagueRace(leagueRace(org_id, 1), [h1, h2]);

    const rows = await listSeasonStandings(org_id, 1);
    const byId = Object.fromEntries(rows.map(r => [r.stable_horse_id, r]));
    // field of 2 in the bottom division: 1st(900)→2pts, 2nd(500)→1pt
    expect(byId['s1']).toMatchObject({ division: 3, points: 2, season_tokens: 900 });
    expect(byId['s2']).toMatchObject({ division: 3, points: 1, season_tokens: 500 });
  });

  it('ranks and scores each division independently (per-division field sizes)', async () => {
    const owner = await makeUser('ScoreOwnerMD');
    const { org_id } = await createOrg(owner, 'ScoreOrgMD');
    await putLeague(baseLeague(org_id)); // divisions:3
    const now = new Date().toISOString();
    const seed = (division: number, stable_horse_id: string) => ensureStanding({
      org_id, season: 1, division, stable_horse_id, horse_name: stable_horse_id,
      user_id: owner.user_id, user_name: 'ScoreOwnerMD', points: 0, season_tokens: 0, entered_at: now,
    });
    // Season-2-like layout: two horses in Div 1, one in Div 2.
    await seed(1, 'd1a'); await seed(1, 'd1b'); await seed(2, 'd2a');

    const mk = (sid: string, tokens: number, sec: number) => horse({
      horse_id: sid, stable_horse_id: sid, user_id: owner.user_id, user_name: 'ScoreOwnerMD',
      final_tokens: tokens, joined_at: `2026-07-07T09:0${sec}:00Z`,
    });
    // Div 2's lone horse has FAR more tokens than Div 1's — proves points are
    // computed per-division (field size + rank), never compared across divisions.
    await scoreLeagueRace(leagueRace(org_id, 1), [mk('d1a', 900, 0), mk('d1b', 500, 1), mk('d2a', 5000, 2)]);

    const byId = Object.fromEntries((await listSeasonStandings(org_id, 1)).map(r => [r.stable_horse_id, r]));
    // Div 1: field of 2 → 1st(900)=2pts, 2nd(500)=1pt
    expect(byId['d1a']).toMatchObject({ division: 1, points: 2 });
    expect(byId['d1b']).toMatchObject({ division: 1, points: 1 });
    // Div 2: field of 1 → 1pt, despite 5000 tokens (not ranked against Div 1)
    expect(byId['d2a']).toMatchObject({ division: 2, points: 1 });
  });

  it('places a new entrant in the bottom division alongside an existing standing in one call', async () => {
    const owner = await makeUser('ScoreMixed');
    const { org_id } = await createOrg(owner, 'MixedOrg');
    await putLeague(baseLeague(org_id)); // divisions.length === 3 → bottom division is 3
    // A veteran already seeded in Div 1 (as if from a prior season).
    await ensureStanding({
      org_id, season: 1, division: 1, stable_horse_id: 'vet', horse_name: 'Vet',
      user_id: owner.user_id, user_name: 'ScoreMixed', points: 0, season_tokens: 0,
      entered_at: new Date().toISOString(),
    });
    const mk = (sid: string, tokens: number) => horse({
      horse_id: sid, stable_horse_id: sid, user_id: owner.user_id, user_name: 'ScoreMixed', final_tokens: tokens,
    });
    // Same fixture: the veteran (Div 1) and a brand-new entrant.
    await scoreLeagueRace(leagueRace(org_id, 1), [mk('vet', 800), mk('newbie', 999)]);

    const byId = Object.fromEntries((await listSeasonStandings(org_id, 1)).map(r => [r.stable_horse_id, r]));
    // Veteran scored in its Div 1 (field of 1 → 1pt); new entrant created in the
    // bottom division (3) and scored there (field of 1 → 1pt) — despite more tokens.
    expect(byId['vet']).toMatchObject({ division: 1, points: 1 });
    expect(byId['newbie']).toMatchObject({ division: 3, points: 1, season_tokens: 999 });
  });

  it('excludes horses whose owner is not an org member', async () => {
    const owner = await makeUser('ScoreOwner2');
    const { org_id } = await createOrg(owner, 'ScoreOrg2');
    await putLeague(baseLeague(org_id));
    const member = horse({ stable_horse_id: 'm', user_id: owner.user_id, final_tokens: 100 });
    const stranger = horse({ stable_horse_id: 'x', user_id: 'not-a-member', final_tokens: 999 });
    await scoreLeagueRace(leagueRace(org_id, 1), [member, stranger]);
    const rows = await listSeasonStandings(org_id, 1);
    expect(rows.map(r => r.stable_horse_id)).toEqual(['m']); // stranger not scored
  });

  it('is idempotent (re-scoring the same round does not double-count)', async () => {
    const owner = await makeUser('ScoreOwner3');
    const { org_id } = await createOrg(owner, 'ScoreOrg3');
    await putLeague(baseLeague(org_id));
    const h1 = horse({ stable_horse_id: 's1', user_id: owner.user_id, final_tokens: 900 });
    const race = leagueRace(org_id, 1);
    await scoreLeagueRace(race, [h1]);
    await scoreLeagueRace(race, [h1]); // re-run
    const [row] = await listSeasonStandings(org_id, 1);
    expect(row.points).toBe(1); // field of 1 → 1 point, not 2
  });

  it('no-ops when the league has been deleted', async () => {
    const owner = await makeUser('ScoreOwner4');
    const { org_id } = await createOrg(owner, 'ScoreOrg4');
    // no putLeague → getLeague returns null
    const h1 = horse({ stable_horse_id: 's1', user_id: owner.user_id, final_tokens: 900 });
    await scoreLeagueRace(leagueRace(org_id, 1), [h1]);
    expect(await listSeasonStandings(org_id, 1)).toEqual([]);
  });
});

describe('scoreLeagueRace return value', () => {
  it('returns the per-division order + linear points for the fixture', async () => {
    const owner = await makeUser('ScoreRetOwn');
    const { org_id } = await createOrg(owner, 'ScoreRetOrg');
    await putLeague(baseLeague(org_id)); // divisions.length === 3 → bottom pool is division 3
    const h1 = horse({ horse_id: 'h1', stable_horse_id: 's1', user_id: owner.user_id, user_name: 'Fast', name: 'Fast', final_tokens: 900, joined_at: '2026-07-07T09:00:00Z' });
    const h2 = horse({ horse_id: 'h2', stable_horse_id: 's2', user_id: owner.user_id, user_name: 'Slow', name: 'Slow', final_tokens: 500, joined_at: '2026-07-07T09:01:00Z' });
    const result = await scoreLeagueRace(leagueRace(org_id, 1), [h1, h2]);
    expect(result?.season).toBe(1);
    expect(result?.round).toBe(1);
    const div3 = result!.divisions.find(d => d.division === 3)!;
    expect(div3.order.map(o => o.stable_horse_id)).toEqual(['s1', 's2']); // ranked by tokens
    expect(div3.order.map(o => o.points_awarded)).toEqual([2, 1]);        // field of 2
    expect(div3.order[0]).toMatchObject({ position: 1, horse_name: 'Fast', final_tokens: 900 });
  });

  it('returns null when the race is not a league fixture', async () => {
    const r = { ...leagueRace('none', 1), league_id: undefined } as Race;
    expect(await scoreLeagueRace(r, [])).toBeNull();
  });
});
