import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../src/handlers/get-organisation.js';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';
import { putWebSession } from '../../src/db/web-sessions.js';
import { generateWebSessionToken } from '../../src/lib/codes.js';

function createEvent(name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, body: JSON.stringify({ name }), isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

function getEventBearer(name: string, token: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'GET /organisations/{org_name}', rawPath: `/organisations/${name}`,
    rawQueryString: '', headers: { authorization: `Bearer ${token}` },
    pathParameters: { org_name: name }, requestContext: {} as any, isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('get-organisation via web session', () => {
  it('returns creator_user_id and works with a bearer session (no X-Cli-Version)', async () => {
    const owner = await makeUser('GetWebOwner');
    await createOrg(createEvent('GetWebOrg', owner));
    const token = generateWebSessionToken();
    await putWebSession(token, owner.user_id, 'GetWebOwner',
      new Date(Date.now() + 3600_000).toISOString(), 3600);

    const res: any = await handler(getEventBearer('GetWebOrg', token));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.creator_user_id).toBe(owner.user_id);
    expect(typeof body.org_join_token).toBe('string');
  });
});
