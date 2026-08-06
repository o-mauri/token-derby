import { describe, it, expect, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { handler as setHandler } from '../../src/handlers/set-org-race-settings.js';
import { handler as getHandler } from '../../src/handlers/get-org-race-settings.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';
import type { SetOrgRaceSettingsRequest } from '@token-derby/shared';

function ev(method: string, orgName: string, body: unknown, user: TestUser | null): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION };
  if (user) { headers['x-user-id'] = user.user_id; headers['x-user-token'] = user.secret_token; }
  return {
    version: '2.0', routeKey: `${method} /organisations/{org_name}/race-settings`,
    rawPath: `/organisations/${orgName}/race-settings`, rawQueryString: '', headers,
    pathParameters: { org_name: orgName }, requestContext: {} as any,
    body: body === undefined ? undefined : JSON.stringify(body), isBase64Encoded: false,
  };
}

async function createOrg(user: TestUser, name: string): Promise<void> {
  const res: any = await createOrgHandler(ev('POST', name, { name }, user) as any);
  if (res.statusCode !== 200) throw new Error(`create-org failed: ${res.body}`);
}

async function setOrgRaceSettingsRaw(orgName: string, body: SetOrgRaceSettingsRequest, user: TestUser): Promise<any> {
  return setHandler(ev('PUT', orgName, body, user));
}

async function setOrgRaceSettings(orgName: string, body: SetOrgRaceSettingsRequest, user: TestUser): Promise<any> {
  const res: any = await setOrgRaceSettingsRaw(orgName, body, user);
  if (res.statusCode !== 200) throw new Error(`set-org-race-settings failed: ${res.statusCode} ${res.body}`);
  return JSON.parse(res.body);
}

async function getOrgRaceSettingsRaw(orgName: string, user: TestUser): Promise<any> {
  return getHandler(ev('GET', orgName, undefined, user));
}

async function getOrgRaceSettings(orgName: string, user: TestUser): Promise<any> {
  const res: any = await getOrgRaceSettingsRaw(orgName, user);
  if (res.statusCode !== 200) throw new Error(`get-org-race-settings failed: ${res.statusCode} ${res.body}`);
  return JSON.parse(res.body);
}

describe('org race settings handlers', () => {
  let orgName: string;
  let ownerAuth: TestUser;
  let otherAuth: TestUser;
  let n = 0;

  beforeEach(async () => {
    n += 1;
    orgName = `RaceSet${n}`;
    ownerAuth = await makeUser(`RSOwn${n}`);
    otherAuth = await makeUser(`RSOth${n}`);
    await createOrg(ownerAuth, orgName);
  });

  it('round-trips a stamina config for the org owner', async () => {
    await setOrgRaceSettings(orgName, { stamina_config: { drain_per_min: 7 } }, ownerAuth);
    const res = await getOrgRaceSettings(orgName, ownerAuth);
    expect(res.settings!.stamina_config).toEqual({ drain_per_min: 7 });
  });

  it('returns null before anything is configured', async () => {
    const res = await getOrgRaceSettings(orgName, ownerAuth);
    expect(res.settings).toBeNull();
  });

  it('rejects a non-owner (get)', async () => {
    const res = await getOrgRaceSettingsRaw(orgName, otherAuth);
    expect(res.statusCode).toBe(403);
  });

  it('rejects a non-owner (set)', async () => {
    const res = await setOrgRaceSettingsRaw(orgName, { stamina_config: { drain_per_min: 7 } }, otherAuth);
    expect(res.statusCode).toBe(403);
  });

  it('rejects an out-of-range value', async () => {
    const res = await setOrgRaceSettingsRaw(orgName, { stamina_config: { drain_per_min: 999 } }, ownerAuth);
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-object stamina_config instead of silently clearing it', async () => {
    const res = await setOrgRaceSettingsRaw(orgName, { stamina_config: 5 } as any, ownerAuth);
    expect(res.statusCode).toBe(400);
  });

  it('rejects an array stamina_config', async () => {
    const res = await setOrgRaceSettingsRaw(orgName, { stamina_config: [] } as any, ownerAuth);
    expect(res.statusCode).toBe(400);
  });

  it('rejects a null stamina_config', async () => {
    const res = await setOrgRaceSettingsRaw(orgName, { stamina_config: null } as any, ownerAuth);
    expect(res.statusCode).toBe(400);
  });

  it('clears the config when given an empty body', async () => {
    await setOrgRaceSettings(orgName, { stamina_config: { drain_per_min: 7 } }, ownerAuth);
    await setOrgRaceSettings(orgName, {}, ownerAuth);
    const res = await getOrgRaceSettings(orgName, ownerAuth);
    expect(res.settings!.stamina_config).toBeUndefined();
  });
});
