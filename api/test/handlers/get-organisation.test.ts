import { describe, it, expect } from 'vitest';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { handler as getOrg } from '../../src/handlers/get-organisation.js';
import { handler as joinOrg } from '../../src/handlers/join-organisation.js';
import { ddb, TABLE } from '../../src/db/client.js';
import { userMetaKey } from '../../src/db/keys.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

function createEvent(name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
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
  };
}

function joinEvent(join_token: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /organisations/join',
    rawPath: '/organisations/join',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify({ join_token }),
    isBase64Encoded: false,
  };
}

function infoEvent(org_name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /organisations/{org_name}',
    rawPath: `/organisations/${org_name}`,
    rawQueryString: '',
    pathParameters: { org_name },
    headers: {
      'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

describe('getOrganisation handler', () => {
  it('returns full info including join token to members', async () => {
    const alice = await makeUser('GetOrg_Alice');
    const created: any = await createOrg(createEvent('InfoOk', alice));
    const createdBody = JSON.parse(created.body);
    const res: any = await getOrg(infoEvent('InfoOk', alice));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.org_id).toBe(createdBody.org_id);
    expect(body.org_name).toBe('InfoOk');
    expect(body.org_join_token).toBe(createdBody.org_join_token);
    expect(body.creator_user_name).toBe('GetOrg_Alice');
  });

  it('returns the four access fields so the Access tab can render its state', async () => {
    const owner = await makeUser('GetOrg_Access');
    await createOrg(createEvent('AccessRead', owner));
    const res: any = await getOrg(infoEvent('AccessRead', owner));
    const body = JSON.parse(res.body);
    // A freshly created org has none of these attributes stored; the db layer
    // defaults them, so the tab renders today's behaviour rather than a blank.
    expect(body.access).toEqual({
      allowed_domains: [],
      join_token_enabled: true,
      domain_join_enabled: false,
      restrict_to_allowed_domains: false,
    });
  });

  it('rejects non-members with NOT_ORG_MEMBER', async () => {
    const alice = await makeUser('GetOrg_Owner');
    const stranger = await makeUser('GetOrg_Stranger');
    await createOrg(createEvent('InfoSec', alice));
    const res: any = await getOrg(infoEvent('InfoSec', stranger));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_MEMBER');
  });

  it('returns ORG_NOT_FOUND for unknown org', async () => {
    const alice = await makeUser('GetOrg_Nope');
    const res: any = await getOrg(infoEvent('Nope', alice));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });

  it('rejects malformed org names without a DB lookup', async () => {
    const alice = await makeUser('GetOrg_Bad');
    const res: any = await getOrg(infoEvent('has%20space', alice));
    expect(res.statusCode).toBe(400);
  });

  it('reflects a creator rename in creator_user_name', async () => {
    const owner = await makeUser('GetOrg_BeforeName');
    await createOrg(createEvent('RenameOrg1', owner));

    const { updateUserDisplayName } = await import('../../src/db/users.js');
    await updateUserDisplayName(owner.user_id, 'GetOrg_AfterName');

    const res: any = await getOrg(infoEvent('RenameOrg1', owner));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).creator_user_name).toBe('GetOrg_AfterName');
  });

  it('falls back to the stored creator name when the creator has no user row', async () => {
    const owner = await makeUser('GetOrg_Vanishing');
    const member = await makeUser('GetOrg_Vanishing_Member');
    const created: any = await createOrg(createEvent('NoCreatorRow', owner));
    const org_join_token = JSON.parse(created.body).org_join_token;
    await joinOrg(joinEvent(org_join_token, member));

    // Simulate the creator's user row being gone; the org row's own
    // creation-time copy is all that is left.
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: userMetaKey(owner.user_id) }));

    const res: any = await getOrg(infoEvent('NoCreatorRow', member));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).creator_user_name).toBe('GetOrg_Vanishing');
  });
});
