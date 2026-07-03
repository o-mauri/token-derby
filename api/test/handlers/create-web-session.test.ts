import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../src/handlers/create-web-session.js';
import { consumeWebGrant } from '../../src/db/web-sessions.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';

function event(user: TestUser | null): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (user) { headers['x-user-id'] = user.user_id; headers['x-user-token'] = user.secret_token; }
  return {
    version: '2.0', routeKey: 'POST /web-sessions', rawPath: '/web-sessions',
    rawQueryString: '', headers, requestContext: {} as any, isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('create-web-session handler', () => {
  it('mints a grant for an authenticated CLI user', async () => {
    const user = await makeUser('WSAlice');
    const res: any = await handler(event(user));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.code).toBe('string');
    const consumed = await consumeWebGrant(body.code);
    expect(consumed).toEqual({ user_id: user.user_id, display_name: 'WSAlice' });
  });

  it('rejects an unauthenticated request', async () => {
    const res: any = await handler(event(null));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
  });
});
