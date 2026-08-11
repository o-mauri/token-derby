import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { OrgSlackMessages, OrgSlackDigest } from '@token-derby/shared';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { handler as getHandler } from '../../src/handlers/get-org-slack.js';
import { handler as setHandler } from '../../src/handlers/set-org-slack.js';
import { handler as deleteHandler } from '../../src/handlers/delete-org-slack.js';
import { getOrganisationById } from '../../src/db/organisations.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

const ALL_ON: OrgSlackMessages = {
  race_created: true,
  race_ended: true,
  league_season_ended: true,
  weekly_digest: false,
  release_published: true,
};

function event(
  method: 'GET' | 'PUT' | 'DELETE',
  orgName: string,
  user: TestUser | null,
  body?: unknown,
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION };
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  return {
    version: '2.0',
    routeKey: `${method} /organisations/{org_name}/slack`,
    rawPath: `/organisations/${orgName}/slack`,
    rawQueryString: '',
    headers,
    pathParameters: { org_name: orgName },
    requestContext: {} as any,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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
      'x-cli-version': CURRENT_CLI_VERSION,
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

describe('org-slack handlers', () => {
  it('GET as owner on an unconfigured org returns all-null', async () => {
    const user = await makeUser('SlNone');
    await createOrg(user, 'SlNone1');
    const res: any = await getHandler(event('GET', 'SlNone1', user));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ configured: false, channel_id: null, messages: null, digest: null });
  });

  it('PUT as owner configures Slack; GET reflects it without the token', async () => {
    const user = await makeUser('SlSet');
    await createOrg(user, 'SlSet1');
    const putRes: any = await setHandler(event('PUT', 'SlSet1', user, {
      bot_token: 'xoxb-secret-token',
      channel_id: 'C123456',
      messages: ALL_ON,
    }));
    expect(putRes.statusCode).toBe(200);
    expect(putRes.body).not.toMatch(/xoxb-secret-token/);
    expect(putRes.body).not.toMatch(/bot_token/);

    const getRes: any = await getHandler(event('GET', 'SlSet1', user));
    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.body);
    expect(body).toEqual({ configured: true, channel_id: 'C123456', messages: ALL_ON, digest: null });
    expect(getRes.body).not.toMatch(/xoxb-secret-token/);
    expect(getRes.body).not.toMatch(/bot_token/);
  });

  it('PUT without bot_token preserves the previously stored token', async () => {
    const user = await makeUser('SlKeep');
    const orgId = await createOrg(user, 'SlKeep1');
    await setHandler(event('PUT', 'SlKeep1', user, {
      bot_token: 'xoxb-original-token',
      channel_id: 'C000001',
      messages: ALL_ON,
    }));

    const updateRes: any = await setHandler(event('PUT', 'SlKeep1', user, {
      channel_id: 'C000002',
      messages: { ...ALL_ON, race_created: false },
    }));
    expect(updateRes.statusCode).toBe(200);
    expect(JSON.parse(updateRes.body).channel_id).toBe('C000002');

    const org = await getOrganisationById(orgId);
    expect(org?.slack?.bot_token).toBe('xoxb-original-token');
    expect(org?.slack?.channel_id).toBe('C000002');
  });

  it('PUT rejects if no token stored and none supplied', async () => {
    const user = await makeUser('SlNoTok');
    await createOrg(user, 'SlNoTok1');
    const res: any = await setHandler(event('PUT', 'SlNoTok1', user, {
      channel_id: 'C123456',
      messages: ALL_ON,
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('PUT as non-owner is rejected', async () => {
    const owner = await makeUser('SlOwn');
    await createOrg(owner, 'SlOwn1');
    const intruder = await makeUser('SlInt');
    const res: any = await setHandler(event('PUT', 'SlOwn1', intruder, {
      bot_token: 'xoxb-x',
      channel_id: 'C1',
      messages: ALL_ON,
    }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_OWNER');
  });

  it('PUT rejects an invalid tz in digest', async () => {
    const user = await makeUser('SlBadTz');
    await createOrg(user, 'SlBadTz1');
    const badDigest: OrgSlackDigest = { weekday: 1, time_local: '09:00', tz: 'Not/AZone' };
    const res: any = await setHandler(event('PUT', 'SlBadTz1', user, {
      bot_token: 'xoxb-x',
      channel_id: 'C1',
      messages: { ...ALL_ON, weekly_digest: true },
      digest: badDigest,
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('PUT requires digest when weekly_digest is true', async () => {
    const user = await makeUser('SlNeedDig');
    await createOrg(user, 'SlNeedDig1');
    const res: any = await setHandler(event('PUT', 'SlNeedDig1', user, {
      bot_token: 'xoxb-x',
      channel_id: 'C1',
      messages: { ...ALL_ON, weekly_digest: true },
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('PUT rejects a messages object missing release_published', async () => {
    const user = await makeUser('SlRel');
    await createOrg(user, 'SlRel1');
    const res: any = await setHandler(event('PUT', 'SlRel1', user, {
      bot_token: 'xoxb-secret-token',
      channel_id: 'C123456',
      // deliberately the old four-key shape
      messages: { race_created: true, race_ended: true, league_season_ended: true, weekly_digest: false },
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/five/);
  });

  it('DELETE as owner clears configuration', async () => {
    const user = await makeUser('SlDel');
    await createOrg(user, 'SlDel1');
    await setHandler(event('PUT', 'SlDel1', user, {
      bot_token: 'xoxb-del',
      channel_id: 'C999',
      messages: ALL_ON,
    }));

    const delRes: any = await deleteHandler(event('DELETE', 'SlDel1', user));
    expect(delRes.statusCode).toBe(200);
    expect(JSON.parse(delRes.body)).toEqual({ ok: true });

    const getRes: any = await getHandler(event('GET', 'SlDel1', user));
    expect(JSON.parse(getRes.body)).toEqual({ configured: false, channel_id: null, messages: null, digest: null });
  });

  it('rejects unauthenticated requests', async () => {
    const res: any = await getHandler(event('GET', 'SlAnon1', null));
    expect(res.statusCode).toBe(401);
  });
});
