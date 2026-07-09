import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as getStandings } from '../../src/handlers/get-org-league-standings.js';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { putLeague } from '../../src/db/leagues.js';
import { ensureLeagueSeason } from '../../src/db/league-seasons.js';
import { ensureStanding } from '../../src/db/league-standings.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';
import type { League } from '@token-derby/shared';

async function createOrg(user: TestUser, name: string): Promise<string> {
  const ev: any = { version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {}, body: JSON.stringify({ name }), isBase64Encoded: false };
  return JSON.parse((await createOrgHandler(ev as APIGatewayProxyEventV2)).body).org_id;
}

const league = (org_id: string): League => ({
  org_id,
  divisions: [{ name: 'Div 1', cap: 10 }, { name: 'Div 2', cap: 10 }, { name: 'Div 3', cap: 10 }],
  boundaries: [2, 2],
  races_per_season: 8, weekdays: [1], start_local: '09:00', end_local: '17:00', tz: 'UTC',
  current_season: 1, status: 'active', created_at: 'c', creator_user_id: 'u', creator_user_name: 'C',
});

const ev = (org_name: string, season?: string): APIGatewayProxyEventV2 => ({
  version: '2.0', routeKey: 'GET /organisations/{org_name}/league/standings',
  rawPath: `/organisations/${org_name}/league/standings`,
  rawQueryString: season !== undefined ? `season=${season}` : '',
  headers: {}, pathParameters: { org_name },
  queryStringParameters: season !== undefined ? { season } : undefined,
  requestContext: {} as any, isBase64Encoded: false,
} as APIGatewayProxyEventV2);

describe('get-org-league-standings', () => {
  it('returns per-division standings (public, no auth)', async () => {
    const owner = await makeUser('StandOwner');
    const org_id = await createOrg(owner, 'StandOrg');
    await putLeague(league(org_id));
    await ensureLeagueSeason(org_id, 1);
    const now = '2026-07-07T00:00:00Z';
    await ensureStanding({ org_id, season: 1, division: 3, stable_horse_id: 'a', horse_name: 'A', user_id: 'u', user_name: 'Al', points: 5, season_tokens: 900, entered_at: now });
    await ensureStanding({ org_id, season: 1, division: 3, stable_horse_id: 'b', horse_name: 'B', user_id: 'u', user_name: 'Bo', points: 2, season_tokens: 100, entered_at: now });

    const res: any = await getStandings(ev('StandOrg'));
    expect(res.statusCode).toBe(200);
    const { standings } = JSON.parse(res.body);
    expect(standings.divisions.map((d: any) => d.division)).toEqual([1, 2, 3]);
    expect(standings.divisions[2].name).toBe('Div 3');
    const bottom = standings.divisions[2].rows;
    expect(bottom.map((r: any) => r.stable_horse_id)).toEqual(['a', 'b']); // 5pts before 2pts
    expect(bottom[0]).toMatchObject({ rank: 1, points: 5 });
    expect(standings).toMatchObject({ org_name: 'StandOrg', season: 1, races_per_season: 8 });
  });

  it('returns null standings when the org has no league', async () => {
    const owner = await makeUser('NoLeague');
    await createOrg(owner, 'NoLeagueOrg');
    const res: any = await getStandings(ev('NoLeagueOrg'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).standings).toBeNull();
  });

  it('404s for an unknown org', async () => {
    const res: any = await getStandings(ev('DoesNotExist'));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });

  it('returns a specific season when ?season= is given', async () => {
    const owner = await makeUser('SeasonOwner');
    const org_id = await createOrg(owner, 'SeasonOrg');
    await putLeague({ ...league(org_id), current_season: 2 });
    await ensureLeagueSeason(org_id, 1);
    await ensureLeagueSeason(org_id, 2);
    const now = '2026-07-07T00:00:00Z';
    await ensureStanding({ org_id, season: 1, division: 3, stable_horse_id: 's1a', horse_name: 'S1A', user_id: 'u', user_name: 'One', points: 5, season_tokens: 900, entered_at: now });
    await ensureStanding({ org_id, season: 2, division: 3, stable_horse_id: 's2a', horse_name: 'S2A', user_id: 'u', user_name: 'Two', points: 3, season_tokens: 300, entered_at: now });

    const pastRes: any = await getStandings(ev('SeasonOrg', '1'));
    expect(pastRes.statusCode).toBe(200);
    const past = JSON.parse(pastRes.body).standings;
    expect(past.season).toBe(1);
    expect(past.divisions[2].rows.map((r: any) => r.stable_horse_id)).toEqual(['s1a']);

    const currentRes: any = await getStandings(ev('SeasonOrg'));
    expect(currentRes.statusCode).toBe(200);
    const current = JSON.parse(currentRes.body).standings;
    expect(current.season).toBe(2);
    expect(current.divisions[2].rows.map((r: any) => r.stable_horse_id)).toEqual(['s2a']);
  });

  it('rejects a non-positive-integer season', async () => {
    const owner = await makeUser('BadSeasonOwn');
    const org_id = await createOrg(owner, 'BadSeasonOrg');
    await putLeague(league(org_id));
    await ensureLeagueSeason(org_id, 1);

    const badStr: any = await getStandings(ev('BadSeasonOrg', 'abc'));
    expect(badStr.statusCode).toBe(400);
    expect(JSON.parse(badStr.body).code).toBe('BAD_REQUEST');

    const zero: any = await getStandings(ev('BadSeasonOrg', '0'));
    expect(zero.statusCode).toBe(400);
    expect(JSON.parse(zero.body).code).toBe('BAD_REQUEST');
  });
});
