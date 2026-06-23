import { describe, it, expect } from 'vitest';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { handler as joinOrg } from '../../src/handlers/join-organisation.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { isMember } from '../../src/db/organisations.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

function eventFor(
  path: string,
  body: unknown,
  user: TestUser,
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `POST ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

async function makeOrg(creator: TestUser, name: string) {
  const res: any = await createOrg(eventFor('/organisations', { name }, creator));
  if (res.statusCode !== 200) throw new Error(`makeOrg failed: ${res.body}`);
  return JSON.parse(res.body) as { org_id: string; org_name: string; org_join_token: string };
}

describe('joinOrganisation handler', () => {
  it('adds the caller as a member when given a valid token', async () => {
    const creator = await makeUser('JO_Creator1');
    const joiner = await makeUser('JO_Joiner1');
    const org = await makeOrg(creator, 'JoinOk');
    const res: any = await joinOrg(eventFor('/organisations/join', { join_token: org.org_join_token }, joiner));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.org_id).toBe(org.org_id);
    expect(body.org_name).toBe('JoinOk');
    expect(await isMember(org.org_id, joiner.user_id)).toBe(true);
  });

  it('is idempotent for already-a-member callers', async () => {
    const creator = await makeUser('JO_Creator2');
    const joiner = await makeUser('JO_Joiner2');
    const org = await makeOrg(creator, 'Idemp');
    await joinOrg(eventFor('/organisations/join', { join_token: org.org_join_token }, joiner));
    const res: any = await joinOrg(eventFor('/organisations/join', { join_token: org.org_join_token }, joiner));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).org_id).toBe(org.org_id);
  });

  it('returns ORG_NOT_FOUND for a bad token', async () => {
    const joiner = await makeUser('JO_Stranger');
    const res: any = await joinOrg(eventFor(
      '/organisations/join',
      { join_token: '00000000-0000-0000-0000-000000000000' },
      joiner,
    ));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });

  it('rejects missing join_token', async () => {
    const joiner = await makeUser('JO_Empty');
    const res: any = await joinOrg(eventFor('/organisations/join', {}, joiner));
    expect(res.statusCode).toBe(400);
  });
});
