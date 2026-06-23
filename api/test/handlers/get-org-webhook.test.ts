import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { handler as setHandler } from '../../src/handlers/set-org-webhook.js';
import { handler } from '../../src/handlers/get-org-webhook.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';

function event(orgName: string, user: TestUser | null): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'x-cli-version': '2.9.0' };
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  return {
    version: '2.0',
    routeKey: 'GET /organisations/{org_name}/webhook',
    rawPath: `/organisations/${orgName}/webhook`,
    rawQueryString: '',
    headers,
    pathParameters: { org_name: orgName },
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

async function createOrg(user: TestUser, name: string): Promise<void> {
  const res: any = await createOrgHandler({
    version: '2.0',
    routeKey: 'POST /organisations',
    rawPath: '/organisations',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.9.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify({ name }),
    isBase64Encoded: false,
  });
  if (res.statusCode !== 200) throw new Error(`create-org failed: ${res.body}`);
}

async function setWebhook(user: TestUser, orgName: string, url: string): Promise<void> {
  const res: any = await setHandler({
    version: '2.0',
    routeKey: 'PUT /organisations/{org_name}/webhook',
    rawPath: `/organisations/${orgName}/webhook`,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.9.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    pathParameters: { org_name: orgName },
    requestContext: {} as any,
    body: JSON.stringify({ url }),
    isBase64Encoded: false,
  });
  if (res.statusCode !== 200) throw new Error(`set-webhook failed: ${res.body}`);
}

describe('getOrgWebhook handler', () => {
  it('returns null when no webhook is configured', async () => {
    const user = await makeUser('GwNone');
    await createOrg(user, 'GwNone1');
    const res: any = await handler(event('GwNone1', user));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ webhook_url: null });
  });

  it('returns the configured URL but never the secret', async () => {
    const user = await makeUser('GwYes');
    await createOrg(user, 'GwYes1');
    await setWebhook(user, 'GwYes1', 'https://example.com/hk');
    const res: any = await handler(event('GwYes1', user));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.webhook_url).toBe('https://example.com/hk');
    expect(body.webhook_secret).toBeUndefined();
    expect(res.body).not.toMatch(/webhook_secret/);
  });

  it('rejects non-creator callers', async () => {
    const owner = await makeUser('GwOwn');
    await createOrg(owner, 'GwOwn1');
    const intruder = await makeUser('GwInt');
    const res: any = await handler(event('GwOwn1', intruder));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_OWNER');
  });

  it('rejects unauthenticated requests', async () => {
    const res: any = await handler(event('GwAnon1', null));
    expect(res.statusCode).toBe(401);
  });
});
