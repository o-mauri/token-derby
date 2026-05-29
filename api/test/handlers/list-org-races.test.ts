import { describe, it, expect } from 'vitest';
import { handler as listOrgRaces } from '../../src/handlers/list-org-races.js';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { handler as createRace } from '../../src/handlers/create-race.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { setRaceEnded } from '../../src/db/races.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';

function createOrgEvent(name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /organisations',
    rawPath: '/organisations',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.6.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify({ name }),
    isBase64Encoded: false,
  };
}

function createRaceEvent(body: any, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /races',
    rawPath: '/races',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.6.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function listEvent(org_name: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /organisations/{org_name}/races',
    rawPath: `/organisations/${org_name}/races`,
    rawQueryString: '',
    pathParameters: { org_name },
    headers: {},
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

describe('listOrgRaces handler', () => {
  it('returns races for an org with computed statuses (live, pending, finished)', async () => {
    const user = await makeUser('LOR_Alice');
    await createOrg(createOrgEvent('LorOrgA', user));

    // Live race: started in the past, hasn't ended yet
    const liveRes: any = await createRace(createRaceEvent({
      name: 'Live one',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorOrgA',
    }, user));
    const liveJoin = JSON.parse(liveRes.body).join_code;

    // Pending race: starts far in the future
    const pendingRes: any = await createRace(createRaceEvent({
      name: 'Pending one',
      start_time: '2099-06-01T00:00:00Z',
      end_time: '2099-06-02T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorOrgA',
    }, user));
    const pendingJoin = JSON.parse(pendingRes.body).join_code;

    // Finished race: explicitly ended
    const finishedRes: any = await createRace(createRaceEvent({
      name: 'Finished one',
      start_time: '2020-02-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorOrgA',
    }, user));
    const finishedBody = JSON.parse(finishedRes.body);
    await setRaceEnded(finishedBody.race_id, '2020-02-01T01:00:00Z');

    const res: any = await listOrgRaces(listEvent('LorOrgA'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.org_name).toBe('LorOrgA');
    expect(body.races).toHaveLength(3);

    const byCode = new Map<string, any>(body.races.map((r: any) => [r.join_code, r]));
    expect(byCode.get(liveJoin).status).toBe('live');
    expect(byCode.get(pendingJoin).status).toBe('pending');
    const finishedSummary = byCode.get(finishedBody.join_code);
    expect(finishedSummary.status).toBe('finished');
    expect(finishedSummary.ended_at).toBe('2020-02-01T01:00:00Z');
  });

  it('does not require auth (public endpoint)', async () => {
    const user = await makeUser('LOR_Pub');
    await createOrg(createOrgEvent('LorPub', user));
    await createRace(createRaceEvent({
      name: 'Public listing',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorPub',
    }, user));

    const res: any = await listOrgRaces(listEvent('LorPub'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).races).toHaveLength(1);
  });

  it('returns an empty list for an org with no races', async () => {
    const user = await makeUser('LOR_Empty');
    await createOrg(createOrgEvent('LorEmpty', user));
    const res: any = await listOrgRaces(listEvent('LorEmpty'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).races).toEqual([]);
  });

  it('returns ORG_NOT_FOUND for unknown org', async () => {
    const res: any = await listOrgRaces(listEvent('NoSuchOrg'));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });

  it('rejects malformed org names with BAD_REQUEST', async () => {
    const res: any = await listOrgRaces(listEvent('bad name'));
    expect(res.statusCode).toBe(400);
  });

  it('omits races that do not belong to the org', async () => {
    const user = await makeUser('LOR_Isolated');
    await createOrg(createOrgEvent('LorIso', user));
    await createRace(createRaceEvent({
      name: 'In org',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorIso',
    }, user));
    await createRace(createRaceEvent({
      name: 'Out of org',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
    }, user));

    const res: any = await listOrgRaces(listEvent('LorIso'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.races).toHaveLength(1);
    expect(body.races[0].name).toBe('In org');
  });
});
