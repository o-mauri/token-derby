import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { resolveCaller } from '../../src/lib/auth.js';
import { makeUser } from '../helpers/auth-helper.js';
import { putWebSession } from '../../src/db/web-sessions.js';
import { generateWebSessionToken } from '../../src/lib/codes.js';

function eventWith(headers: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'GET /organisations', rawPath: '/organisations',
    rawQueryString: '', headers, requestContext: {} as any, isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('resolveCaller', () => {
  it('resolves CLI header auth with source=cli', async () => {
    const user = await makeUser('RCAlice');
    const res = await resolveCaller(eventWith({
      'x-user-id': user.user_id, 'x-user-token': user.secret_token,
    }));
    expect(res).toEqual({ user_id: user.user_id, display_name: 'RCAlice', source: 'cli' });
  });

  it('resolves web-session bearer auth with source=web', async () => {
    const token = generateWebSessionToken();
    const exp = new Date(Date.now() + 3600_000).toISOString();
    await putWebSession(token, 'web-user', 'WebBob', exp, 3600);
    const res = await resolveCaller(eventWith({ authorization: `Bearer ${token}` }));
    expect(res).toEqual({ user_id: 'web-user', display_name: 'WebBob', source: 'web' });
  });

  it('errors on an unknown bearer token', async () => {
    const res = await resolveCaller(eventWith({ authorization: 'Bearer nonsense' }));
    expect('error' in res).toBe(true);
  });

  it('errors when no credentials are present', async () => {
    const res = await resolveCaller(eventWith({}));
    expect('error' in res).toBe(true);
  });
});
