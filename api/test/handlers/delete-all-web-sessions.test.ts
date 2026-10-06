import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { handler } from '../../src/handlers/delete-all-web-sessions.js';
import { putWebSession, getWebSession } from '../../src/db/web-sessions.js';
import { putDevice } from '../../src/db/devices.js';
import { createUserWithEmail } from '../../src/db/identities.js';
import { generateWebSessionToken } from '../../src/lib/codes.js';

function event(headers: Record<string, string> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'DELETE /api/web-sessions/all', rawPath: '/api/web-sessions/all',
    rawQueryString: '', headers, requestContext: {} as any, isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}
const later = () => new Date(Date.now() + 3600_000).toISOString();

describe('delete-all-web-sessions handler', () => {
  it('signs the caller out of every browser, this one included', async () => {
    const me = randomUUID(), other = randomUUID();
    const [here, there, theirs] = [generateWebSessionToken(), generateWebSessionToken(), generateWebSessionToken()];
    await putWebSession(here, me, 'Me', later(), 3600);
    await putWebSession(there, me, 'Me', later(), 3600);
    await putWebSession(theirs, other, 'Other', later(), 3600);
    const res: any = await handler(event({ authorization: `Bearer ${here}` }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ signed_out: 2 });
    expect(await getWebSession(here)).toBeNull();
    expect(await getWebSession(there)).toBeNull();
    expect(await getWebSession(theirs)).not.toBeNull();
  });

  it('leaves CLI devices signed in', async () => {
    const me = randomUUID();
    await createUserWithEmail({ user_id: me, email: `${me}@example.com`, idp_sub: `sub-${me}`, display_name: 'Me' });
    await putDevice({ user_id: me, token: `dev-${me}`, label: 'laptop' });
    const web = generateWebSessionToken();
    await putWebSession(web, me, 'Me', later(), 3600);
    await handler(event({ authorization: `Bearer ${web}` }));
    const res: any = await handler(event({ 'x-user-id': me, 'x-user-token': `dev-${me}` }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ signed_out: 0 });
  });

  it('refuses no credentials', async () => {
    const res: any = await handler(event());
    expect(res.statusCode).toBe(401);
  });
});
