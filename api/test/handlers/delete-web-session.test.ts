import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../src/handlers/delete-web-session.js';
import { putWebSession, getWebSession } from '../../src/db/web-sessions.js';
import { generateWebSessionToken } from '../../src/lib/codes.js';

function event(auth?: string): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (auth) headers['authorization'] = `Bearer ${auth}`;
  return {
    version: '2.0', routeKey: 'DELETE /web-sessions', rawPath: '/web-sessions',
    rawQueryString: '', headers, requestContext: {} as any, isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('delete-web-session handler', () => {
  it('deletes the caller session', async () => {
    const token = generateWebSessionToken();
    await putWebSession(token, 'u1', 'Alice', new Date(Date.now() + 3600_000).toISOString(), 3600);
    const res: any = await handler(event(token));
    expect(res.statusCode).toBe(200);
    expect(await getWebSession(token)).toBeNull();
  });

  it('is a no-op (still 200) without a token', async () => {
    const res: any = await handler(event());
    expect(res.statusCode).toBe(200);
  });
});
