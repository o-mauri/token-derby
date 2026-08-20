import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../src/handlers/exchange-web-session.js';
import { putWebGrant, getWebSession } from '../../src/db/web-sessions.js';
import { putUser } from '../../src/db/users.js';
import { generateWebSessionCode } from '../../src/lib/codes.js';

const uid = () => `u-exchange-${Math.random().toString(36).slice(2)}`;

function event(body: unknown): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'POST /web-sessions/exchange', rawPath: '/web-sessions/exchange',
    rawQueryString: '', headers: { 'content-type': 'application/json' },
    requestContext: {} as any, body: JSON.stringify(body), isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('exchange-web-session handler', () => {
  it('exchanges a valid grant for a session token', async () => {
    const code = generateWebSessionCode();
    await putWebGrant(code, 'u1', 'Alice', 60);
    const res: any = await handler(event({ code }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.token).toBe('string');
    expect(body.user).toEqual({ user_id: 'u1', display_name: 'Alice' });
    const session = await getWebSession(body.token);
    expect(session?.user_id).toBe('u1');
  });

  it('rejects a second exchange of the same code (single-use)', async () => {
    const code = generateWebSessionCode();
    await putWebGrant(code, 'u1', 'Alice', 60);
    await handler(event({ code }));
    const res: any = await handler(event({ code }));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
  });

  it('rejects an unknown code', async () => {
    const res: any = await handler(event({ code: 'nope' }));
    expect(res.statusCode).toBe(401);
  });

  it('rejects a missing body', async () => {
    const res: any = await handler(event({}));
    expect(res.statusCode).toBe(400);
  });

  it('includes email in the response when the user row has one linked', async () => {
    const id = uid();
    await putUser({ user_id: id, display_name: 'Alice', created_at: '2026-04-01T00:00:00.000Z', email: 'alice@example.com' }, 'H');
    const code = generateWebSessionCode();
    await putWebGrant(code, id, 'Alice', 60);
    const res: any = await handler(event({ code }));
    const body = JSON.parse(res.body);
    expect(body.user).toEqual({ user_id: id, display_name: 'Alice', email: 'alice@example.com' });
  });

  it('omits email from the response when the user row has none', async () => {
    const id = uid();
    await putUser({ user_id: id, display_name: 'Bob', created_at: '2026-04-01T00:00:00.000Z' }, 'H');
    const code = generateWebSessionCode();
    await putWebGrant(code, id, 'Bob', 60);
    const res: any = await handler(event({ code }));
    const body = JSON.parse(res.body);
    expect(body.user).toEqual({ user_id: id, display_name: 'Bob' });
    expect('email' in body.user).toBe(false);
  });
});
