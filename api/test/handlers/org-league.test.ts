import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as setLeague } from '../../src/handlers/set-org-league.js';
import { handler as getLeague } from '../../src/handlers/get-org-league.js';
import { handler as deleteLeague } from '../../src/handlers/delete-org-league.js';
import { handler as setSchedule } from '../../src/handlers/set-org-schedule.js';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { putSchedule } from '../../src/db/schedules.js';
import { getLeague as getLeagueRow } from '../../src/db/leagues.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

const AUTH = (u: TestUser) => ({
  'content-type': 'application/json',
  'x-cli-version': CURRENT_CLI_VERSION,
  'x-user-id': u.user_id,
  'x-user-token': u.secret_token,
});

async function createOrg(user: TestUser, name: string): Promise<string> {
  const ev: APIGatewayProxyEventV2 = {
    version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
    headers: AUTH(user), requestContext: {} as any, body: JSON.stringify({ name }), isBase64Encoded: false,
  };
  const res: any = await createOrgHandler(ev);
  if (res.statusCode !== 200) throw new Error(`create-org failed: ${res.body}`);
  return JSON.parse(res.body).org_id;
}

const VALID_BODY = {
  divisions: [{ name: 'Div 1', cap: 10 }, { name: 'Div 2', cap: 10 }, { name: 'Div 3', cap: 10 }],
  boundaries: [2, 2],
  races_per_season: 8, weekdays: [1], start_local: '09:00', end_local: '17:00', tz: 'UTC',
};

function ev(method: string, org_name: string, headers: Record<string, string>, body?: unknown): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: `${method} /organisations/{org_name}/league`,
    rawPath: `/organisations/${org_name}/league`, rawQueryString: '',
    headers, pathParameters: { org_name }, requestContext: {} as any,
    body: body === undefined ? undefined : JSON.stringify(body), isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('org-league handlers', () => {
  it('sets a league (season 1, active), then reads it back', async () => {
    const user = await makeUser('LeagueOwner');
    await createOrg(user, 'LeagueOrg1');

    const setRes: any = await setLeague(ev('PUT', 'LeagueOrg1', AUTH(user), VALID_BODY));
    expect(setRes.statusCode).toBe(200);
    const set = JSON.parse(setRes.body);
    expect(set.league).toMatchObject({
      divisions: [{ name: 'Div 1', cap: 10 }, { name: 'Div 2', cap: 10 }, { name: 'Div 3', cap: 10 }],
      current_season: 1, status: 'active', creator_user_name: 'LeagueOwner',
    });

    const getRes: any = await getLeague(ev('GET', 'LeagueOrg1', AUTH(user)));
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body).league).toMatchObject({
      divisions: [{ name: 'Div 1', cap: 10 }, { name: 'Div 2', cap: 10 }, { name: 'Div 3', cap: 10 }],
      races_per_season: 8,
    });
  });

  it('rejects an invalid config with BAD_REQUEST', async () => {
    const user = await makeUser('LeagueOwner2');
    await createOrg(user, 'LeagueOrg2');
    const res: any = await setLeague(ev('PUT', 'LeagueOrg2', AUTH(user), { ...VALID_BODY, boundaries: [99, 2] }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('rejects an invalid timezone with BAD_REQUEST', async () => {
    const user = await makeUser('LeagueOwner3');
    await createOrg(user, 'LeagueOrg3');
    const res: any = await setLeague(ev('PUT', 'LeagueOrg3', AUTH(user), { ...VALID_BODY, tz: 'Not/AZone' }));
    expect(res.statusCode).toBe(400);
  });

  it('refuses to set a league when a schedule already exists (LEAGUE_CONFLICT)', async () => {
    const user = await makeUser('LeagueOwner4');
    const org_id = await createOrg(user, 'LeagueOrg4');
    await putSchedule({
      org_id, weekdays: [1], start_local: '09:00', end_local: '17:00', tz: 'UTC',
      created_at: '2026-07-07T00:00:00.000Z', creator_user_id: user.user_id, creator_user_name: 'LeagueOwner4',
    });
    const res: any = await setLeague(ev('PUT', 'LeagueOrg4', AUTH(user), VALID_BODY));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('LEAGUE_CONFLICT');
  });

  it('only the org owner can set a league', async () => {
    const owner = await makeUser('LeagueOwner5');
    await createOrg(owner, 'LeagueOrg5');
    const other = await makeUser('Interloper');
    const res: any = await setLeague(ev('PUT', 'LeagueOrg5', AUTH(other), VALID_BODY));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_OWNER');
  });

  it('get returns null when no league is configured', async () => {
    const user = await makeUser('LeagueOwner6');
    await createOrg(user, 'LeagueOrg6');
    const res: any = await getLeague(ev('GET', 'LeagueOrg6', AUTH(user)));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).league).toBeNull();
  });

  it('delete removes the league and is idempotent', async () => {
    const user = await makeUser('LeagueOwner7');
    await createOrg(user, 'LeagueOrg7');
    await setLeague(ev('PUT', 'LeagueOrg7', AUTH(user), VALID_BODY));
    const del1: any = await deleteLeague(ev('DELETE', 'LeagueOrg7', AUTH(user)));
    expect(del1.statusCode).toBe(200);
    expect(JSON.parse(del1.body)).toEqual({ ok: true });
    const del2: any = await deleteLeague(ev('DELETE', 'LeagueOrg7', AUTH(user)));
    expect(del2.statusCode).toBe(200); // idempotent
    const getRes: any = await getLeague(ev('GET', 'LeagueOrg7', AUTH(user)));
    expect(JSON.parse(getRes.body).league).toBeNull();
  });

  it('refuses to set a schedule when a league already exists (LEAGUE_CONFLICT)', async () => {
    const user = await makeUser('SchedGuard');
    await createOrg(user, 'SchedGuardOr');
    const set: any = await setLeague(ev('PUT', 'SchedGuardOr', AUTH(user), VALID_BODY));
    expect(set.statusCode).toBe(200);

    const scheduleEv: APIGatewayProxyEventV2 = {
      version: '2.0', routeKey: 'PUT /organisations/{org_name}/schedule',
      rawPath: '/organisations/SchedGuardOr/schedule', rawQueryString: '',
      headers: AUTH(user), pathParameters: { org_name: 'SchedGuardOr' }, requestContext: {} as any,
      body: JSON.stringify({ weekdays: [1], start_local: '09:00', end_local: '17:00', tz: 'UTC' }),
      isBase64Encoded: false,
    } as APIGatewayProxyEventV2;
    const res: any = await setSchedule(scheduleEv);
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('LEAGUE_CONFLICT');
  });

  it('applies live fields immediately and stages structural edits on an existing league', async () => {
    const user = await makeUser('LiveEditOwn');
    const org_id = await createOrg(user, 'LiveEditOrg');
    const setRes: any = await setLeague(ev('PUT', 'LiveEditOrg', AUTH(user), VALID_BODY));
    expect(setRes.statusCode).toBe(200);

    const newCaps = [{ name: 'Div 1', cap: 5 }, { name: 'Div 2', cap: 5 }, { name: 'Div 3', cap: 5 }];
    const edited = { ...VALID_BODY, weekdays: [2, 4], divisions: newCaps, boundaries: [1, 1] };
    const editRes: any = await setLeague(ev('PUT', 'LiveEditOrg', AUTH(user), edited));
    expect(editRes.statusCode).toBe(200);

    const row = await getLeagueRow(org_id);
    expect(row?.weekdays).toEqual([2, 4]);
    expect(row?.divisions).toEqual(VALID_BODY.divisions);
    expect(row?.pending_structural?.divisions).toEqual(newCaps);
    expect(row?.pending_structural?.boundaries).toEqual([1, 1]);
    expect(row?.current_season).toBe(1);
  });

  it('clears pending_structural when a later edit restores the live shape', async () => {
    const user = await makeUser('RestoreOwner');
    const org_id = await createOrg(user, 'RestoreOrg');
    await setLeague(ev('PUT', 'RestoreOrg', AUTH(user), VALID_BODY));

    const newCaps = [{ name: 'Div 1', cap: 5 }, { name: 'Div 2', cap: 5 }, { name: 'Div 3', cap: 5 }];
    await setLeague(ev('PUT', 'RestoreOrg', AUTH(user), { ...VALID_BODY, divisions: newCaps }));
    const staged = await getLeagueRow(org_id);
    expect(staged?.pending_structural?.divisions).toEqual(newCaps);

    await setLeague(ev('PUT', 'RestoreOrg', AUTH(user), VALID_BODY));
    const restored = await getLeagueRow(org_id);
    expect(restored?.pending_structural).toBeUndefined();
    expect(restored?.divisions).toEqual(VALID_BODY.divisions);
  });

  it('preserves current_season/status/created_at/creator on edit', async () => {
    const user = await makeUser('PreserveOwn');
    const org_id = await createOrg(user, 'PreserveOrg');
    await setLeague(ev('PUT', 'PreserveOrg', AUTH(user), VALID_BODY));
    const before = await getLeagueRow(org_id);

    await setLeague(ev('PUT', 'PreserveOrg', AUTH(user), { ...VALID_BODY, weekdays: [3] }));
    const after = await getLeagueRow(org_id);

    expect(after?.current_season).toBe(before?.current_season);
    expect(after?.status).toBe(before?.status);
    expect(after?.created_at).toBe(before?.created_at);
    expect(after?.creator_user_id).toBe(before?.creator_user_id);
    expect(after?.creator_user_name).toBe(before?.creator_user_name);
    expect(after?.weekdays).toEqual([3]);
  });

  it('stages a races_per_season change without touching divisions/boundaries', async () => {
    const user = await makeUser('RacesOwner');
    const org_id = await createOrg(user, 'RacesOrg');
    await setLeague(ev('PUT', 'RacesOrg', AUTH(user), VALID_BODY));

    await setLeague(ev('PUT', 'RacesOrg', AUTH(user), { ...VALID_BODY, races_per_season: 12 }));
    const row = await getLeagueRow(org_id);
    expect(row?.pending_structural?.races_per_season).toBe(12);
    expect(row?.pending_structural?.divisions).toBeUndefined();
    expect(row?.pending_structural?.boundaries).toBeUndefined();
    expect(row?.races_per_season).toBe(8);
    expect(row?.divisions).toEqual(VALID_BODY.divisions);
    expect(row?.boundaries).toEqual(VALID_BODY.boundaries);
  });

  it('clears a previously-set live optional field when a later edit omits it', async () => {
    const user = await makeUser('OptClearOwn');
    const org_id = await createOrg(user, 'OptClearOrg');
    // First set with a race_name...
    await setLeague(ev('PUT', 'OptClearOrg', AUTH(user), { ...VALID_BODY, race_name: 'Friday League' }));
    expect((await getLeagueRow(org_id))?.race_name).toBe('Friday League');
    // ...then edit WITHOUT race_name → it must be cleared (removeUndefinedValues + full-item put).
    await setLeague(ev('PUT', 'OptClearOrg', AUTH(user), VALID_BODY));
    expect((await getLeagueRow(org_id))?.race_name).toBeUndefined();
  });
});
