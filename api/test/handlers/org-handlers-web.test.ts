import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as listOrgs } from '../../src/handlers/list-organisations.js';
import { handler as setWebhook } from '../../src/handlers/set-org-webhook.js';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';
import { putWebSession } from '../../src/db/web-sessions.js';
import { generateWebSessionToken } from '../../src/lib/codes.js';

async function webTokenFor(user: TestUser): Promise<string> {
  const token = generateWebSessionToken();
  await putWebSession(token, user.user_id, user.display_name,
    new Date(Date.now() + 3600_000).toISOString(), 3600);
  return token;
}

function createEvent(name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, body: JSON.stringify({ name }), isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('org handlers accept web sessions', () => {
  it('list-organisations works with a bearer session', async () => {
    const user = await makeUser('WebListUser');
    await createOrg(createEvent('WebListOrg', user));
    const token = await webTokenFor(user);
    const res: any = await listOrgs({
      version: '2.0', routeKey: 'GET /organisations', rawPath: '/organisations', rawQueryString: '',
      headers: { authorization: `Bearer ${token}` }, requestContext: {} as any, isBase64Encoded: false,
    } as APIGatewayProxyEventV2);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).organisations.some((o: any) => o.org_name === 'WebListOrg')).toBe(true);
  });

  it('set-org-webhook works for the owner via web session WITHOUT an X-Cli-Version header', async () => {
    const user = await makeUser('WebHookOwner');
    await createOrg(createEvent('WebHookOrg', user));
    const token = await webTokenFor(user);
    const res: any = await setWebhook({
      version: '2.0', routeKey: 'PUT /organisations/{org_name}/webhook',
      rawPath: '/organisations/WebHookOrg/webhook', rawQueryString: '',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      pathParameters: { org_name: 'WebHookOrg' },
      body: JSON.stringify({ url: 'https://example.com/hook' }),
      requestContext: {} as any, isBase64Encoded: false,
    } as APIGatewayProxyEventV2);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.webhook_url).toBe('https://example.com/hook');
    expect(typeof body.webhook_secret).toBe('string');
  });
});
