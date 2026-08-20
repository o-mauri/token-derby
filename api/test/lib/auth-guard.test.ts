import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { authenticate } from '../../src/lib/auth.js';
import { putUser } from '../../src/db/users.js';
import { randomUUID } from 'node:crypto';

function ev(user_id: string, token: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'GET /jockey/me', rawPath: '/jockey/me', rawQueryString: '',
    headers: { 'x-user-id': user_id, 'x-user-token': token },
    requestContext: {} as any, isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('authenticate with an SSO-created user', () => {
  it('returns an auth error rather than throwing when the row has no secret_token_hash', async () => {
    const user_id = randomUUID();
    // putUser requires a hash; write the row without one the way an SSO create will.
    const { ddb, TABLE } = await import('../../src/db/client.js');
    const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
    const { userMetaKey } = await import('../../src/db/keys.js');
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...userMetaKey(user_id),
        user_id, display_name: 'SsoOnly', created_at: new Date().toISOString(),
        email: 'sso-only@example.com', email_verified: true, idp: 'google', idp_sub: 'sub-1',
      },
    }));

    const res = await authenticate(ev(user_id, 'any-token-at-all'));
    expect('error' in res).toBe(true);
    expect((res as { error: string }).error).toMatch(/token/i);
  });

  it('still authenticates a legacy user that does have a hash', async () => {
    const user_id = randomUUID();
    const { hashSecretToken } = await import('../../src/lib/auth.js');
    await putUser(
      { user_id, display_name: 'LegacyUser', created_at: new Date().toISOString() },
      hashSecretToken('secret-abc'),
    );
    const res = await authenticate(ev(user_id, 'secret-abc'));
    expect('error' in res).toBe(false);
    expect((res as { user_id: string }).user_id).toBe(user_id);
  });

  it('rejects a wrong token for a legacy user', async () => {
    const user_id = randomUUID();
    const { hashSecretToken } = await import('../../src/lib/auth.js');
    await putUser(
      { user_id, display_name: 'LegacyUser2', created_at: new Date().toISOString() },
      hashSecretToken('right'),
    );
    const res = await authenticate(ev(user_id, 'wrong'));
    expect('error' in res).toBe(true);
  });
});
