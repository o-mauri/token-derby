import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { handler as setHandler } from '../../src/handlers/set-org-webhook.js';
import { handler } from '../../src/handlers/delete-org-webhook.js';
import { getOrganisationByName } from '../../src/db/organisations.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

function event(orgName: string, user: TestUser | null): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'x-cli-version': CURRENT_CLI_VERSION };
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  return {
    version: '2.0',
    routeKey: 'DELETE /organisations/{org_name}/webhook',
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
      'x-cli-version': CURRENT_CLI_VERSION,
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
      'x-cli-version': CURRENT_CLI_VERSION,
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

describe('deleteOrgWebhook handler', () => {
  it('clears both url and secret', async () => {
    const user = await makeUser('DwAlice');
    await createOrg(user, 'DwAcme1');
    await setWebhook(user, 'DwAcme1', 'https://example.com/h');
    const res: any = await handler(event('DwAcme1', user));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    const persisted = await getOrganisationByName('DwAcme1');
    expect(persisted?.webhook_url).toBeUndefined();
    expect(persisted?.webhook_secret).toBeUndefined();
  });

  it('is idempotent when no webhook is configured', async () => {
    const user = await makeUser('DwIdem');
    await createOrg(user, 'DwIdem1');
    const res: any = await handler(event('DwIdem1', user));
    expect(res.statusCode).toBe(200);
  });

  it('rejects non-creator callers', async () => {
    const owner = await makeUser('DwOwn');
    await createOrg(owner, 'DwOwn1');
    const intruder = await makeUser('DwInt');
    const res: any = await handler(event('DwOwn1', intruder));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_OWNER');
  });

  it('rejects unauthenticated requests', async () => {
    const res: any = await handler(event('DwAnon1', null));
    expect(res.statusCode).toBe(401);
  });
});
