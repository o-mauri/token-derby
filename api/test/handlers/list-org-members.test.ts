import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { OrgAccessSettings } from '@token-derby/shared';
import { handler } from '../../src/handlers/list-org-members.js';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { addMember, setOrgAccess } from '../../src/db/organisations.js';
import { attachEmailToUser } from '../../src/db/identities.js';
import { ddb, TABLE } from '../../src/db/client.js';
import { userMetaKey } from '../../src/db/keys.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

const domain = () => `d${randomUUID().replace(/-/g, '').slice(0, 8)}.example.com`;

async function linkEmail(user: TestUser, email: string, hd?: string) {
  await attachEmailToUser({ user_id: user.user_id, email, idp_sub: `sub-${randomUUID()}`, ...(hd ? { hd } : {}) });
}

// attachEmailToUser always writes email_verified: true, so an unverified row
// is only reachable by writing the user row directly — mirrors the same hack
// join-organisation.test.ts uses for the same reason.
async function linkUnverifiedEmail(user: TestUser, email: string) {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: userMetaKey(user.user_id),
    UpdateExpression: 'SET email = :e, email_verified = :v',
    ConditionExpression: 'attribute_exists(pk)',
    ExpressionAttributeValues: { ':e': email, ':v': false },
  }));
}

async function allowDomains(org_id: string, allowed_domains: string[]) {
  const access: OrgAccessSettings = {
    allowed_domains, join_token_enabled: true, domain_join_enabled: false, restrict_to_allowed_domains: false,
  };
  await setOrgAccess(org_id, access, undefined);
}

function createEvent(name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, body: JSON.stringify({ name }), isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

function membersEvent(name: string, user: TestUser | null): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (user) { headers['x-user-id'] = user.user_id; headers['x-user-token'] = user.secret_token; }
  return {
    version: '2.0', routeKey: 'GET /organisations/{org_name}/members',
    rawPath: `/organisations/${name}/members`, rawQueryString: '', headers,
    pathParameters: { org_name: name }, requestContext: {} as any, isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('list-org-members handler', () => {
  it('returns members for a member of the org', async () => {
    const owner = await makeUser('MemOwner');
    await createOrg(createEvent('MemOrg1', owner));
    const res: any = await handler(membersEvent('MemOrg1', owner));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.members).toHaveLength(1);
    expect(body.members[0].user_id).toBe(owner.user_id);
    expect(body.members[0].user_name).toBe('MemOwner');
    expect(typeof body.members[0].joined_at).toBe('string');
    // The caller here is the creator, so the owner-only columns are present —
    // the unlinked default state for a member with no Google account at all.
    expect(body.members[0].linked_email).toBe(false);
    expect(body.members[0].matches_domain).toBe('n/a');
  });

  it('rejects a non-member with NOT_ORG_MEMBER', async () => {
    const owner = await makeUser('MemOwner2');
    await createOrg(createEvent('MemOrg2', owner));
    const outsider = await makeUser('MemOutsider');
    const res: any = await handler(membersEvent('MemOrg2', outsider));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_MEMBER');
  });

  it('rejects unauthenticated', async () => {
    const res: any = await handler(membersEvent('MemOrg2', null));
    expect(res.statusCode).toBe(401);
  });
});

describe('list-org-members handler — linkage columns are owner-only', () => {
  it('omits linked_email and matches_domain entirely for a non-owner member', async () => {
    const owner = await makeUser('LinkOwner1');
    const createRes: any = await createOrg(createEvent('LinkOrg1', owner));
    const { org_id } = JSON.parse(createRes.body);
    const member = await makeUser('LinkMember1');
    await addMember(org_id, member.user_id, new Date().toISOString());

    const res: any = await handler(membersEvent('LinkOrg1', member));
    expect(res.statusCode).toBe(200);
    // Assert on the raw body text as well as the parsed shape — a mutation
    // that serialises `linked_email: undefined` would still parse back with
    // the key absent, but a leak that ships `false`/`'n/a'` would show up in
    // the raw string even if a sloppy `in` check on the parsed object missed it.
    expect(res.body).not.toContain('linked_email');
    expect(res.body).not.toContain('matches_domain');
    const body = JSON.parse(res.body);
    expect(body.members).toHaveLength(2);
    for (const m of body.members) {
      expect('linked_email' in m).toBe(false);
      expect('matches_domain' in m).toBe(false);
    }
  });

  it('includes linked_email and matches_domain for every member when the caller is the owner', async () => {
    const owner = await makeUser('LinkOwner2');
    const createRes: any = await createOrg(createEvent('LinkOrg2', owner));
    const { org_id } = JSON.parse(createRes.body);
    const member = await makeUser('LinkMember2');
    await addMember(org_id, member.user_id, new Date().toISOString());

    const res: any = await handler(membersEvent('LinkOrg2', owner));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.members).toHaveLength(2);
    for (const m of body.members) {
      expect(typeof m.linked_email).toBe('boolean');
      expect(['yes', 'no', 'n/a']).toContain(m.matches_domain);
    }
  });
});

describe('list-org-members handler — linked_email states', () => {
  it('ticks a member with a verified linked email', async () => {
    const owner = await makeUser('LinkedOwner1');
    const createRes: any = await createOrg(createEvent('LinkedOrg1', owner));
    const { org_id } = JSON.parse(createRes.body);
    const member = await makeUser('VerifiedMember');
    await addMember(org_id, member.user_id, new Date().toISOString());
    await linkEmail(member, `verified@${domain()}`);

    const res: any = await handler(membersEvent('LinkedOrg1', owner));
    const body = JSON.parse(res.body);
    const row = body.members.find((m: any) => m.user_id === member.user_id);
    expect(row.linked_email).toBe(true);
  });

  it('crosses a member with no linked email at all', async () => {
    const owner = await makeUser('LinkedOwner2');
    const createRes: any = await createOrg(createEvent('LinkedOrg2', owner));
    const { org_id } = JSON.parse(createRes.body);
    const member = await makeUser('NoEmailMember');
    await addMember(org_id, member.user_id, new Date().toISOString());

    const res: any = await handler(membersEvent('LinkedOrg2', owner));
    const body = JSON.parse(res.body);
    const row = body.members.find((m: any) => m.user_id === member.user_id);
    expect(row.linked_email).toBe(false);
  });

  it('crosses a member with an unverified email — unverified proves nothing', async () => {
    const owner = await makeUser('LinkedOwner3');
    const createRes: any = await createOrg(createEvent('LinkedOrg3', owner));
    const { org_id } = JSON.parse(createRes.body);
    const member = await makeUser('UnverifiedMember');
    await addMember(org_id, member.user_id, new Date().toISOString());
    await linkUnverifiedEmail(member, `unverified@${domain()}`);

    const res: any = await handler(membersEvent('LinkedOrg3', owner));
    const body = JSON.parse(res.body);
    const row = body.members.find((m: any) => m.user_id === member.user_id);
    expect(row.linked_email).toBe(false);
  });
});

describe('list-org-members handler — matches_domain states', () => {
  it('is n/a when the org has no allowed_domains, even for a verified member', async () => {
    const owner = await makeUser('DomOwner1');
    const createRes: any = await createOrg(createEvent('DomOrg1', owner));
    const { org_id } = JSON.parse(createRes.body);
    const member = await makeUser('DomMember1');
    await addMember(org_id, member.user_id, new Date().toISOString());
    await linkEmail(member, `person@${domain()}`);

    const res: any = await handler(membersEvent('DomOrg1', owner));
    const row = JSON.parse(res.body).members.find((m: any) => m.user_id === member.user_id);
    expect(row.matches_domain).toBe('n/a');
  });

  it('is n/a when the member has no linked email, even with allowed_domains set', async () => {
    const owner = await makeUser('DomOwner2');
    const createRes: any = await createOrg(createEvent('DomOrg2', owner));
    const { org_id } = JSON.parse(createRes.body);
    await allowDomains(org_id, [domain()]);
    const member = await makeUser('DomMember2');
    await addMember(org_id, member.user_id, new Date().toISOString());

    const res: any = await handler(membersEvent('DomOrg2', owner));
    const row = JSON.parse(res.body).members.find((m: any) => m.user_id === member.user_id);
    expect(row.matches_domain).toBe('n/a');
  });

  it('ticks when the verified email domain is in allowed_domains', async () => {
    const owner = await makeUser('DomOwner3');
    const createRes: any = await createOrg(createEvent('DomOrg3', owner));
    const { org_id } = JSON.parse(createRes.body);
    const allowed = domain();
    await allowDomains(org_id, [allowed]);
    const member = await makeUser('DomMember3');
    await addMember(org_id, member.user_id, new Date().toISOString());
    await linkEmail(member, `person@${allowed}`);

    const res: any = await handler(membersEvent('DomOrg3', owner));
    const row = JSON.parse(res.body).members.find((m: any) => m.user_id === member.user_id);
    expect(row.matches_domain).toBe('yes');
  });

  it('crosses when the verified email domain is not in allowed_domains', async () => {
    const owner = await makeUser('DomOwner4');
    const createRes: any = await createOrg(createEvent('DomOrg4', owner));
    const { org_id } = JSON.parse(createRes.body);
    await allowDomains(org_id, [domain()]);
    const member = await makeUser('DomMember4');
    await addMember(org_id, member.user_id, new Date().toISOString());
    await linkEmail(member, `person@${domain()}`);

    const res: any = await handler(membersEvent('DomOrg4', owner));
    const row = JSON.parse(res.body).members.find((m: any) => m.user_id === member.user_id);
    expect(row.matches_domain).toBe('no');
  });

  it('ticks on an hd match even when the verified email sits on a different domain', async () => {
    const owner = await makeUser('DomOwner5');
    const createRes: any = await createOrg(createEvent('DomOrg5', owner));
    const { org_id } = JSON.parse(createRes.body);
    const workspaceDomain = domain();
    const secondaryEmailDomain = domain();
    await allowDomains(org_id, [workspaceDomain]);
    const member = await makeUser('DomMember5');
    await addMember(org_id, member.user_id, new Date().toISOString());
    // hd is the Workspace domain; the address itself sits on a different,
    // non-allowed domain — provenDomains returns both, and the hd proof alone
    // should be enough to tick.
    await linkEmail(member, `person@${secondaryEmailDomain}`, workspaceDomain);

    const res: any = await handler(membersEvent('DomOrg5', owner));
    const row = JSON.parse(res.body).members.find((m: any) => m.user_id === member.user_id);
    expect(row.matches_domain).toBe('yes');
  });
});
