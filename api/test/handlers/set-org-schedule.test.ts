import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { handler as setHandler } from '../../src/handlers/set-org-schedule.js';
import { handler as getHandler } from '../../src/handlers/get-org-schedule.js';
import { handler as delHandler } from '../../src/handlers/delete-org-schedule.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

function ev(method: string, orgName: string, body: unknown, user: TestUser | null, cliVersion: string | null = CURRENT_CLI_VERSION): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  if (user) { headers['x-user-id'] = user.user_id; headers['x-user-token'] = user.secret_token; }
  return {
    version: '2.0', routeKey: `${method} /organisations/{org_name}/schedule`,
    rawPath: `/organisations/${orgName}/schedule`, rawQueryString: '', headers,
    pathParameters: { org_name: orgName }, requestContext: {} as any,
    body: body === undefined ? undefined : JSON.stringify(body), isBase64Encoded: false,
  };
}

async function createOrg(user: TestUser, name: string): Promise<void> {
  const res: any = await createOrgHandler(ev('POST', name, { name }, user) as any);
  if (res.statusCode !== 200) throw new Error(`create-org failed: ${res.body}`);
}

const VALID = { weekdays: [1, 2, 3, 4, 5], start_local: '09:00', end_local: '17:30', tz: 'Europe/London' };

describe('org schedule handlers', () => {
  it('sets, gets, and deletes a schedule (creator)', async () => {
    const user = await makeUser('SchOwn');
    await createOrg(user, 'SchOrg1');

    const setRes: any = await setHandler(ev('PUT', 'SchOrg1', VALID, user));
    expect(setRes.statusCode).toBe(200);
    expect(JSON.parse(setRes.body).schedule.weekdays).toEqual([1, 2, 3, 4, 5]);

    const getRes: any = await getHandler(ev('GET', 'SchOrg1', undefined, user));
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body).schedule.tz).toBe('Europe/London');

    const delRes: any = await delHandler(ev('DELETE', 'SchOrg1', undefined, user));
    expect(delRes.statusCode).toBe(200);

    const getRes2: any = await getHandler(ev('GET', 'SchOrg1', undefined, user));
    expect(JSON.parse(getRes2.body).schedule).toBeNull();
  });

  it('get returns null when none is set', async () => {
    const user = await makeUser('SchNone');
    await createOrg(user, 'SchNone1');
    const getRes: any = await getHandler(ev('GET', 'SchNone1', undefined, user));
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body).schedule).toBeNull();
  });

  it('rejects non-creator', async () => {
    const owner = await makeUser('SchO2');
    await createOrg(owner, 'SchO2Org');
    const intruder = await makeUser('SchInt');
    const res: any = await setHandler(ev('PUT', 'SchO2Org', VALID, intruder));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_OWNER');
  });

  it('rejects bad weekdays', async () => {
    const user = await makeUser('SchWd');
    await createOrg(user, 'SchWd1');
    const res: any = await setHandler(ev('PUT', 'SchWd1', { ...VALID, weekdays: [0, 8] }, user));
    expect(res.statusCode).toBe(400);
  });

  it('rejects end_local <= start_local', async () => {
    const user = await makeUser('SchWin');
    await createOrg(user, 'SchWin1');
    const res: any = await setHandler(ev('PUT', 'SchWin1', { ...VALID, start_local: '17:30', end_local: '09:00' }, user));
    expect(res.statusCode).toBe(400);
  });

  it('persists primary_top5 when set, leaves it unset by default', async () => {
    const user = await makeUser('SchTop5');
    await createOrg(user, 'SchTop5Org');

    const setRes: any = await setHandler(ev('PUT', 'SchTop5Org', { ...VALID, primary_top5: true }, user));
    expect(setRes.statusCode).toBe(200);
    expect(JSON.parse(setRes.body).schedule.primary_top5).toBe(true);

    const setRes2: any = await setHandler(ev('PUT', 'SchTop5Org', VALID, user));
    expect(setRes2.statusCode).toBe(200);
    expect(JSON.parse(setRes2.body).schedule.primary_top5).toBeUndefined();
  });

  it('rejects an invalid timezone', async () => {
    const user = await makeUser('SchTz');
    await createOrg(user, 'SchTz1');
    const res: any = await setHandler(ev('PUT', 'SchTz1', { ...VALID, tz: 'Mars/Olympus' }, user));
    expect(res.statusCode).toBe(400);
  });

  it('rejects unauthenticated', async () => {
    const res: any = await setHandler(ev('PUT', 'SchAnon', VALID, null));
    expect(res.statusCode).toBe(401);
  });

  it('rejects unknown orgs', async () => {
    const user = await makeUser('SchMiss');
    const res: any = await setHandler(ev('PUT', 'NoSuchOrg', VALID, user));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });
});
