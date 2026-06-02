import { describe, it, expect } from 'vitest';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { handler as leaderboard } from '../../src/handlers/get-org-leaderboard.js';
import { addMember } from '../../src/db/organisations.js';
import { putStableHorse } from '../../src/db/stable.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { StableHorse } from '@token-derby/shared';

function createEvent(name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
    headers: {
      'content-type': 'application/json', 'x-cli-version': '2.6.0',
      'x-user-id': user.user_id, 'x-user-token': user.secret_token,
    },
    requestContext: {} as any, body: JSON.stringify({ name }), isBase64Encoded: false,
  };
}

function lbEvent(org_name: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'GET /organisations/{org_name}/leaderboard',
    rawPath: `/organisations/${org_name}/leaderboard`, rawQueryString: '',
    pathParameters: { org_name }, headers: {}, requestContext: {} as any, isBase64Encoded: false,
  };
}

// Generate a unique short org name (≤12 alphanumeric chars) by taking the last
// 6 digits of Date.now().  The prefix is kept short so the combined length fits
// within the ORG_NAME_PATTERN limit of 12 chars.
function uid(): string { return String(Date.now()).slice(-6); }

function horse(id: string, name: string, stats: Partial<StableHorse>): StableHorse {
  return {
    stable_horse_id: id, name, colors: { body: '#1', mane: '#2', tail: '#3', saddle: '#4' },
    created_at: new Date().toISOString(), xp: 0, ...stats,
  };
}

describe('getOrgLeaderboard handler', () => {
  it('returns all org horses sorted by xp desc with mapped stats', async () => {
    const alice = await makeUser('LB_Alice');
    const orgName = `LBoard${uid()}`;
    const created: any = await createOrg(createEvent(orgName, alice));
    const { org_id } = JSON.parse(created.body);

    const bob = await makeUser('LB_Bob');
    await addMember(org_id, bob.user_id, 'LB_Bob', new Date().toISOString());

    await putStableHorse(alice.user_id, horse('h-a', 'Comet', { xp: 300, wins: 5, podiums: 8, races_entered: 12 }));
    await putStableHorse(bob.user_id,   horse('h-b', 'Bolt',  { xp: 900, wins: 2, podiums: 3, races_entered: 4 }));

    const res: any = await leaderboard(lbEvent(orgName));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.org_name).toBe(orgName);
    expect(body.horses.map((h: any) => h.name)).toEqual(['Bolt', 'Comet']); // xp desc
    const comet = body.horses.find((h: any) => h.name === 'Comet');
    expect(comet).toMatchObject({ owner_name: 'LB_Alice', wins: 5, podiums: 8, xp: 300, races_entered: 12 });
  });

  it('defaults missing stat fields to 0', async () => {
    const alice = await makeUser('LB_Defaults');
    const orgName = `LBDef${uid()}`;
    await createOrg(createEvent(orgName, alice));
    await putStableHorse(alice.user_id, horse('h-d', 'Plain', { xp: 50 })); // no wins/podiums/races_entered

    const res: any = await leaderboard(lbEvent(orgName));
    const plain = JSON.parse(res.body).horses.find((h: any) => h.name === 'Plain');
    expect(plain).toMatchObject({ wins: 0, podiums: 0, races_entered: 0, xp: 50 });
  });

  it('returns empty horses for an org with no horses', async () => {
    const alice = await makeUser('LB_EmptyOrg');
    const orgName = `LBEmp${uid()}`;
    await createOrg(createEvent(orgName, alice));
    const res: any = await leaderboard(lbEvent(orgName));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).horses).toEqual([]);
  });

  it('returns ORG_NOT_FOUND for an unknown org', async () => {
    const res: any = await leaderboard(lbEvent('NoSuchOrg'));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });

  it('returns BAD_REQUEST for a malformed org name', async () => {
    const res: any = await leaderboard(lbEvent('has%20space'));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });
});
