import { describe, it, expect } from 'vitest';
import { handler } from '../../src/handlers/create-organisation.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getOrganisationByName, isMember } from '../../src/db/organisations.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';
import { putWebSession } from '../../src/db/web-sessions.js';
import { generateWebSessionToken } from '../../src/lib/codes.js';

function event(
  body: unknown,
  user: TestUser | null,
  cliVersion: string | null = CURRENT_CLI_VERSION,
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  return {
    version: '2.0',
    routeKey: 'POST /organisations',
    rawPath: '/organisations',
    rawQueryString: '',
    headers,
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe('createOrganisation handler', () => {
  it('creates an org and auto-joins the creator', async () => {
    const user = await makeUser('OrgAlice');
    const res: any = await handler(event({ name: 'Acme1' }, user));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.org_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.org_name).toBe('Acme1');
    expect(body.org_join_token).toMatch(/^[0-9a-f-]{36}$/);

    const persisted = await getOrganisationByName('Acme1');
    expect(persisted?.org_id).toBe(body.org_id);
    expect(persisted?.creator_user_id).toBe(user.user_id);
    expect(await isMember(body.org_id, user.user_id)).toBe(true);
  });

  it('rejects duplicate names (case-sensitive)', async () => {
    const user = await makeUser('OrgDup');
    await handler(event({ name: 'Dup1' }, user));
    const res: any = await handler(event({ name: 'Dup1' }, user));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('ORG_NAME_TAKEN');
  });

  it('treats different cases as distinct orgs', async () => {
    const user = await makeUser('OrgCase');
    const a: any = await handler(event({ name: 'Case' }, user));
    const b: any = await handler(event({ name: 'case' }, user));
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    expect(JSON.parse(a.body).org_id).not.toBe(JSON.parse(b.body).org_id);
  });

  it('rejects names with spaces', async () => {
    const user = await makeUser('OrgSpace');
    const res: any = await handler(event({ name: 'has space' }, user));
    expect(res.statusCode).toBe(400);
  });

  it('rejects names with special characters', async () => {
    const user = await makeUser('OrgDash');
    const res: any = await handler(event({ name: 'no-dash' }, user));
    expect(res.statusCode).toBe(400);
  });

  it('rejects names longer than 12 characters', async () => {
    const user = await makeUser('OrgLong');
    const res: any = await handler(event({ name: 'a'.repeat(13) }, user));
    expect(res.statusCode).toBe(400);
  });

  it('accepts exactly 12 characters', async () => {
    const user = await makeUser('Org12');
    const res: any = await handler(event({ name: 'a'.repeat(12) }, user));
    expect(res.statusCode).toBe(200);
  });

  it('rejects unauthenticated requests', async () => {
    const res: any = await handler(event({ name: 'Anon1' }, null));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
  });

  it('rejects too-old CLI versions', async () => {
    const user = await makeUser('OrgOldCli');
    const res: any = await handler(event({ name: 'OldCli' }, user, '0.2.0'));
    expect(res.statusCode).toBe(426);
  });

  it('creates an org via a bearer web session without X-Cli-Version', async () => {
    const owner = await makeUser('OrgWebOwner');
    const token = generateWebSessionToken();
    await putWebSession(
      token,
      owner.user_id,
      'OrgWebOwner',
      new Date(Date.now() + 3600_000).toISOString(),
      3600,
    );

    const webEvent: APIGatewayProxyEventV2 = {
      version: '2.0',
      routeKey: 'POST /organisations',
      rawPath: '/organisations',
      rawQueryString: '',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      requestContext: {} as any,
      body: JSON.stringify({ name: 'WebOrg1' }),
      isBase64Encoded: false,
    };

    const res: any = await handler(webEvent);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.org_name).toBe('WebOrg1');

    const persisted = await getOrganisationByName('WebOrg1');
    expect(persisted?.creator_user_id).toBe(owner.user_id);
    expect(await isMember(body.org_id, owner.user_id)).toBe(true);
  });
});
