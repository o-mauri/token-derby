import { describe, it, expect } from 'vitest';
import { handler as initJockey } from '../../src/handlers/init-jockey.js';
import { handler as getJockey } from '../../src/handlers/get-jockey.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

function initEvent(body: unknown, cliVersion: string | null = '2.4.0'): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  return {
    version: '2.0',
    routeKey: 'POST /jockey/init',
    rawPath: '/jockey/init',
    rawQueryString: '',
    headers,
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function meEvent(userId: string, token: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /jockey/me',
    rawPath: '/jockey/me',
    rawQueryString: '',
    headers: {
      'x-cli-version': '2.4.0',
      'x-user-id': userId,
      'x-user-token': token,
    },
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

describe('init-jockey handler', () => {
  it('creates a user and returns a secret token', async () => {
    const res: any = await initJockey(initEvent({ display_name: 'Alice' }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.display_name).toBe('Alice');
    // base64url-encoded 32 bytes = 43 chars without padding.
    expect(body.secret_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('returns a different token each time', async () => {
    const a: any = await initJockey(initEvent({ display_name: 'A' }));
    const b: any = await initJockey(initEvent({ display_name: 'B' }));
    expect(JSON.parse(a.body).secret_token).not.toBe(JSON.parse(b.body).secret_token);
    expect(JSON.parse(a.body).user_id).not.toBe(JSON.parse(b.body).user_id);
  });

  it('rejects empty display_name', async () => {
    const res: any = await initJockey(initEvent({ display_name: '' }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects display_name > 40 chars', async () => {
    const res: any = await initJockey(initEvent({ display_name: 'x'.repeat(41) }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing CLI version', async () => {
    const res: any = await initJockey(initEvent({ display_name: 'A' }, null));
    expect(res.statusCode).toBe(400);
  });

  it('rejects CLI versions older than 2.0.0', async () => {
    const res: any = await initJockey(initEvent({ display_name: 'A' }, '1.5.0'));
    expect(res.statusCode).toBe(426);
  });

  it('newly created user can be fetched via /jockey/me with the returned token', async () => {
    const created: any = await initJockey(initEvent({ display_name: 'AuthTest' }));
    const body = JSON.parse(created.body);
    const me: any = await getJockey(meEvent(body.user_id, body.secret_token));
    expect(me.statusCode).toBe(200);
    const meBody = JSON.parse(me.body);
    expect(meBody.user_id).toBe(body.user_id);
    expect(meBody.display_name).toBe('AuthTest');
  });

  it('rejects /jockey/me with the wrong token', async () => {
    const created: any = await initJockey(initEvent({ display_name: 'AuthBad' }));
    const body = JSON.parse(created.body);
    const me: any = await getJockey(meEvent(body.user_id, 'wrong-token'));
    expect(me.statusCode).toBe(401);
    expect(JSON.parse(me.body).code).toBe('UNAUTHENTICATED');
  });
});
