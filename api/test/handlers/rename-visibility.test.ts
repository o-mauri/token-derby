import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { handler as listMembers } from '../../src/handlers/list-org-members.js';
import { handler as getOrg } from '../../src/handlers/get-organisation.js';
import { handler as createRace } from '../../src/handlers/create-race.js';
import { getRaceByJoinCode } from '../../src/db/races.js';
import { updateUserDisplayName } from '../../src/db/users.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

function orgEvent(name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, body: JSON.stringify({ name }), isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

function pathEvent(routeKey: string, org_name: string, suffix: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey, rawPath: `/organisations/${org_name}${suffix}`, rawQueryString: '',
    pathParameters: { org_name },
    headers: { 'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

function raceEvent(user: TestUser): APIGatewayProxyEventV2 {
  const start = new Date(Date.now() + 60_000).toISOString();
  const end = new Date(Date.now() + 3_600_000).toISOString();
  return {
    version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any,
    body: JSON.stringify({ name: 'Freeze Test', start_time: start, end_time: end, tz: 'Europe/London' }),
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('renaming a user', () => {
  it('is immediately visible in the members list and the org overview', async () => {
    const owner = await makeUser('RenameVis_Before');
    await createOrg(orgEvent('RenameVis1', owner));

    await updateUserDisplayName(owner.user_id, 'RenameVis_After');

    const membersRes: any = await listMembers(
      pathEvent('GET /organisations/{org_name}/members', 'RenameVis1', '/members', owner),
    );
    expect(membersRes.statusCode).toBe(200);
    expect(JSON.parse(membersRes.body).members[0].user_name).toBe('RenameVis_After');

    const orgRes: any = await getOrg(
      pathEvent('GET /organisations/{org_name}', 'RenameVis1', '', owner),
    );
    expect(orgRes.statusCode).toBe(200);
    expect(JSON.parse(orgRes.body).creator_user_name).toBe('RenameVis_After');
  });

  it('does NOT rewrite the creator name already stamped on a race', async () => {
    const owner = await makeUser('RaceFreeze_Before');
    const created: any = await createRace(raceEvent(owner));
    expect(created.statusCode).toBe(200);
    const join_code = JSON.parse(created.body).join_code;

    await updateUserDisplayName(owner.user_id, 'RaceFreeze_After');

    const race = await getRaceByJoinCode(join_code);
    expect(race).not.toBeNull();
    // Race rows are a point-in-time record: the stamped name must not change.
    expect(race!.creator_user_name).toBe('RaceFreeze_Before');
  });
});
