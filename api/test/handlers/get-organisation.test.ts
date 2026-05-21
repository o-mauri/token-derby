import { describe, it, expect } from 'vitest';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { handler as getOrg } from '../../src/handlers/get-organisation.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';

function createEvent(name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /organisations',
    rawPath: '/organisations',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.4.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify({ name }),
    isBase64Encoded: false,
  };
}

function infoEvent(org_name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /organisations/{org_name}',
    rawPath: `/organisations/${org_name}`,
    rawQueryString: '',
    pathParameters: { org_name },
    headers: {
      'x-cli-version': '2.4.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

describe('getOrganisation handler', () => {
  it('returns full info including join token to members', async () => {
    const alice = await makeUser('GetOrg_Alice');
    const created: any = await createOrg(createEvent('InfoOk', alice));
    const createdBody = JSON.parse(created.body);
    const res: any = await getOrg(infoEvent('InfoOk', alice));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.org_id).toBe(createdBody.org_id);
    expect(body.org_name).toBe('InfoOk');
    expect(body.org_join_token).toBe(createdBody.org_join_token);
    expect(body.creator_user_name).toBe('GetOrg_Alice');
  });

  it('rejects non-members with NOT_ORG_MEMBER', async () => {
    const alice = await makeUser('GetOrg_Owner');
    const stranger = await makeUser('GetOrg_Stranger');
    await createOrg(createEvent('InfoSec', alice));
    const res: any = await getOrg(infoEvent('InfoSec', stranger));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_MEMBER');
  });

  it('returns ORG_NOT_FOUND for unknown org', async () => {
    const alice = await makeUser('GetOrg_Nope');
    const res: any = await getOrg(infoEvent('Nope', alice));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });

  it('rejects malformed org names without a DB lookup', async () => {
    const alice = await makeUser('GetOrg_Bad');
    const res: any = await getOrg(infoEvent('has%20space', alice));
    expect(res.statusCode).toBe(400);
  });
});
