import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { handler as getJockey } from '../../src/handlers/get-jockey.js';
import { putUser } from '../../src/db/users.js';
import { createUserWithEmail } from '../../src/db/identities.js';
import { putDevice } from '../../src/db/devices.js';
import { hashSecretToken } from '../../src/lib/token-hash.js';

function meEvent(userId: string, token: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /jockey/me',
    rawPath: '/jockey/me',
    rawQueryString: '',
    headers: {
      'x-user-id': userId,
      'x-user-token': token,
    },
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

describe('get-jockey handler', () => {
  it('includes email for a linked account', async () => {
    const user_id = randomUUID();
    const email = `${user_id}@example.com`;
    await createUserWithEmail({
      user_id, email, idp_sub: `sub-${user_id}`, display_name: 'Linked',
    });
    await putDevice({ user_id, token: 'linked-dev-tok', label: 'laptop' });

    const res: any = await getJockey(meEvent(user_id, 'linked-dev-tok'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe(email);
  });

  it('omits the email key entirely for an unlinked (legacy) account', async () => {
    const user_id = randomUUID();
    await putUser(
      { user_id, display_name: 'Legacy', created_at: new Date().toISOString() },
      hashSecretToken('legacy-secret'),
    );

    const res: any = await getJockey(meEvent(user_id, 'legacy-secret'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect('email' in body).toBe(false);
  });

  it('authenticates via a Phase 2 device credential, not just a legacy token', async () => {
    const user_id = randomUUID();
    const email = `${user_id}@example.com`;
    await createUserWithEmail({
      user_id, email, idp_sub: `sub-${user_id}`, display_name: 'DeviceUser',
    });
    await putDevice({ user_id, token: 'device-only-tok', label: 'desktop' });

    const res: any = await getJockey(meEvent(user_id, 'device-only-tok'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user_id).toBe(user_id);
    expect(body.email).toBe(email);
  });
});
