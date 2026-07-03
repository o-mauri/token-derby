import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../src/handlers/list-org-members.js';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

function createEvent(name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, body: JSON.stringify({ name }), isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

function membersEvent(name: string, user: TestUser | null): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (user) { headers['x-user-id'] = user.user_id; headers['x-user-token'] = user.secret_token; }
  return {
    version: '2.0', routeKey: 'GET /organisations/{org_name}/members',
    rawPath: `/organisations/${name}/members`, rawQueryString: '', headers,
    pathParameters: { org_name: name }, requestContext: {} as any, isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('list-org-members handler', () => {
  it('returns members for a member of the org', async () => {
    const owner = await makeUser('MemOwner');
    await createOrg(createEvent('MemOrg1', owner));
    const res: any = await handler(membersEvent('MemOrg1', owner));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.members).toHaveLength(1);
    expect(body.members[0].user_id).toBe(owner.user_id);
    expect(body.members[0].user_name).toBe('MemOwner');
    expect(typeof body.members[0].joined_at).toBe('string');
  });

  it('rejects a non-member with NOT_ORG_MEMBER', async () => {
    const owner = await makeUser('MemOwner2');
    await createOrg(createEvent('MemOrg2', owner));
    const outsider = await makeUser('MemOutsider');
    const res: any = await handler(membersEvent('MemOrg2', outsider));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_MEMBER');
  });

  it('rejects unauthenticated', async () => {
    const res: any = await handler(membersEvent('MemOrg2', null));
    expect(res.statusCode).toBe(401);
  });
});
