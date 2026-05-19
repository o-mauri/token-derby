import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { handler } from '../../src/handlers/set-org-webhook.js';
import { getOrganisationByName } from '../../src/db/organisations.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';

function event(
  orgName: string,
  body: unknown,
  user: TestUser | null,
  cliVersion: string | null = '2.0.0',
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  return {
    version: '2.0',
    routeKey: 'PUT /organisations/{org_name}/webhook',
    rawPath: `/organisations/${orgName}/webhook`,
    rawQueryString: '',
    headers,
    pathParameters: { org_name: orgName },
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

async function createOrg(user: TestUser, name: string): Promise<string> {
  const res: any = await createOrgHandler({
    version: '2.0',
    routeKey: 'POST /organisations',
    rawPath: '/organisations',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.0.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify({ name }),
    isBase64Encoded: false,
  });
  if (res.statusCode !== 200) throw new Error(`create-org failed: ${res.body}`);
  return JSON.parse(res.body).org_id;
}

describe('setOrgWebhook handler', () => {
  it('stores the url and returns a one-time secret', async () => {
    const user = await makeUser('WhAlice');
    await createOrg(user, 'WhAcme1');
    const res: any = await handler(event('WhAcme1', { url: 'https://example.com/hook' }, user));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.webhook_url).toBe('https://example.com/hook');
    expect(body.webhook_secret).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    const persisted = await getOrganisationByName('WhAcme1');
    expect(persisted?.webhook_url).toBe('https://example.com/hook');
    expect(persisted?.webhook_secret).toBe(body.webhook_secret);
  });

  it('rotates the secret on re-set', async () => {
    const user = await makeUser('WhRotate');
    await createOrg(user, 'WhRot1');
    const a: any = await handler(event('WhRot1', { url: 'https://a.example/x' }, user));
    const b: any = await handler(event('WhRot1', { url: 'https://b.example/y' }, user));
    expect(JSON.parse(b.body).webhook_secret).not.toBe(JSON.parse(a.body).webhook_secret);
  });

  it('rejects http:// URLs', async () => {
    const user = await makeUser('WhHttp');
    await createOrg(user, 'WhHttp1');
    const res: any = await handler(event('WhHttp1', { url: 'http://example.com/hook' }, user));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('rejects localhost', async () => {
    const user = await makeUser('WhLocal');
    await createOrg(user, 'WhLocal1');
    const res: any = await handler(event('WhLocal1', { url: 'https://localhost/hook' }, user));
    expect(res.statusCode).toBe(400);
  });

  it('rejects malformed URLs', async () => {
    const user = await makeUser('WhBad');
    await createOrg(user, 'WhBad1');
    const res: any = await handler(event('WhBad1', { url: 'not a url' }, user));
    expect(res.statusCode).toBe(400);
  });

  it('rejects non-creator members', async () => {
    const owner = await makeUser('WhOwn');
    await createOrg(owner, 'WhOwn1');
    const intruder = await makeUser('WhInt');
    const res: any = await handler(event('WhOwn1', { url: 'https://example.com/hook' }, intruder));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_OWNER');
  });

  it('rejects unauthenticated requests', async () => {
    const res: any = await handler(event('WhAnon', { url: 'https://example.com/h' }, null));
    expect(res.statusCode).toBe(401);
  });

  it('rejects unknown orgs', async () => {
    const user = await makeUser('WhMiss');
    const res: any = await handler(event('NoSuchOrg', { url: 'https://example.com/h' }, user));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });

  it('rejects too-old CLIs', async () => {
    const user = await makeUser('WhOld');
    await createOrg(user, 'WhOld1');
    const res: any = await handler(event('WhOld1', { url: 'https://example.com/h' }, user, '0.2.0'));
    expect(res.statusCode).toBe(426);
  });
});
