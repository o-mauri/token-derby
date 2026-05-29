import { describe, it, expect } from 'vitest';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { handler as joinOrg } from '../../src/handlers/join-organisation.js';
import { handler as listOrgs } from '../../src/handlers/list-organisations.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';

function postEvent(path: string, body: unknown, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `POST ${path}`,
    rawPath: path,
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

function getEvent(user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /organisations',
    rawPath: '/organisations',
    rawQueryString: '',
    headers: {
      'x-cli-version': '2.6.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

describe('listOrganisations handler', () => {
  it('returns only orgs the caller is a member of, sorted by name', async () => {
    const alice = await makeUser('ListA_Alice');
    const bob = await makeUser('ListA_Bob');
    const a: any = await createOrg(postEvent('/organisations', { name: 'ListZeta' }, alice));
    const b: any = await createOrg(postEvent('/organisations', { name: 'ListAlpha' }, alice));
    const aBody = JSON.parse(a.body);
    const bBody = JSON.parse(b.body);

    const aliceRes: any = await listOrgs(getEvent(alice));
    expect(aliceRes.statusCode).toBe(200);
    const aliceList = JSON.parse(aliceRes.body).organisations as Array<{ org_id: string; org_name: string }>;
    const names = aliceList.map(o => o.org_name);
    expect(names).toContain('ListAlpha');
    expect(names).toContain('ListZeta');
    expect(names.indexOf('ListAlpha')).toBeLessThan(names.indexOf('ListZeta'));

    const bobRes: any = await listOrgs(getEvent(bob));
    expect(bobRes.statusCode).toBe(200);
    const bobList = JSON.parse(bobRes.body).organisations as Array<{ org_id: string; org_name: string }>;
    const bobIds = bobList.map(o => o.org_id);
    expect(bobIds).not.toContain(aBody.org_id);
    expect(bobIds).not.toContain(bBody.org_id);
  });

  it('includes orgs joined via token', async () => {
    const alice = await makeUser('ListB_Alice');
    const bob = await makeUser('ListB_Bob');
    const created: any = await createOrg(postEvent('/organisations', { name: 'JoinedX' }, alice));
    const body = JSON.parse(created.body);
    await joinOrg(postEvent('/organisations/join', { join_token: body.org_join_token }, bob));

    const res: any = await listOrgs(getEvent(bob));
    const list = JSON.parse(res.body).organisations as Array<{ org_id: string }>;
    expect(list.map(o => o.org_id)).toContain(body.org_id);
  });
});
