import { describe, it, expect } from 'vitest';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { handler as joinOrg } from '../../src/handlers/join-organisation.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { randomUUID } from 'node:crypto';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { OrgAccessSettings } from '@token-derby/shared';
import { ddb, TABLE } from '../../src/db/client.js';
import { orgMetaKey, userMetaKey } from '../../src/db/keys.js';
import { isMember } from '../../src/db/organisations.js';
import { claimOrgDomain } from '../../src/db/org-domains.js';
import { attachEmailToUser } from '../../src/db/identities.js';
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

// ---------------------------------------------------------------------------
// Phase 3: org access control
// ---------------------------------------------------------------------------

// Every rejection below asserts the MEMBER# row is absent as well as the error
// code. Four of these refusals mean "you cannot join", so a test that only
// checked the status could pass while the wrong guard fired, and one that only
// checked the code could pass while the row was written anyway.
async function expectNotAMember(org_id: string, user: TestUser) {
  expect(await isMember(org_id, user.user_id)).toBe(false);
}

// No setter for the four access fields exists yet (that is the settings
// endpoint, later in this phase), so the row is updated directly — which is
// also how an existing production org would look once an admin flips one.
async function setOrgAccess(org_id: string, fields: Partial<OrgAccessSettings>) {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const sets: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    names[`#${k}`] = k;
    values[`:${k}`] = v;
    sets.push(`#${k} = :${k}`);
  }
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: orgMetaKey(org_id),
    UpdateExpression: `SET ${sets.join(', ')}`,
    ConditionExpression: 'attribute_exists(pk)',
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }));
}

// Goes through the real identity-link write path, so the email lands verified
// exactly as a Google sign-in would leave it.
async function linkEmail(user: TestUser, email: string, hd?: string) {
  await attachEmailToUser({ user_id: user.user_id, email, idp_sub: `sub-${randomUUID()}`, ...(hd ? { hd } : {}) });
}

// Org names are capped at 12 alphanumeric characters, so the prefix is trimmed
// and the rest is random — unique names keep ORG_NAME_TAKEN out of these tests.
function orgName(prefix: string) {
  return `${prefix.slice(0, 4)}${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function uniqueDomain(label: string) {
  return `${label}-${randomUUID()}.test`.toLowerCase();
}

// A META row exactly as it looked before Phase 3 — none of the four access
// fields present. putOrganisation would not prove the same thing, because it
// writes whatever the caller passes; every org in production today is this
// shape, and a token join must keep working for all of them.
async function putLegacyOrg() {
  const org_id = `org-legacy-${randomUUID()}`;
  const org_name = orgName('LegacyJoin');
  const org_join_token = randomUUID();
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...orgMetaKey(org_id),
      org_id,
      org_name,
      created_at: new Date().toISOString(),
      creator_user_id: 'u-legacy',
      creator_user_name: 'Legacy Creator',
      org_join_token,
    },
  }));
  return { org_id, org_name, org_join_token };
}

function joinEvent(user: TestUser, body: unknown) {
  return eventFor('/organisations/join', body, user);
}

describe('joinOrganisation: token route', () => {
  it('rejects JOIN_TOKEN_DISABLED once the org turns its token off, and writes no member row', async () => {
    const creator = await makeUser('JO_TDCreator');
    const joiner = await makeUser('JO_TDJoiner');
    const org = await makeOrg(creator, orgName('TokenOff'));
    await setOrgAccess(org.org_id, { join_token_enabled: false });

    const res: any = await joinOrg(joinEvent(joiner, { join_token: org.org_join_token }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('JOIN_TOKEN_DISABLED');
    await expectNotAMember(org.org_id, joiner);
  });

  it('still admits a token join when the org explicitly leaves the token enabled', async () => {
    const creator = await makeUser('JO_TDOnCreator');
    const joiner = await makeUser('JO_TDOnJoiner');
    const org = await makeOrg(creator, orgName('TokenOn'));
    await setOrgAccess(org.org_id, { join_token_enabled: true });

    const res: any = await joinOrg(joinEvent(joiner, { join_token: org.org_join_token }));
    expect(res.statusCode).toBe(200);
    expect(await isMember(org.org_id, joiner.user_id)).toBe(true);
  });

  it('accepts a token join for a legacy org row that has none of the access fields', async () => {
    const joiner = await makeUser('JO_LegacyJoiner');
    const org = await putLegacyOrg();

    const res: any = await joinOrg(joinEvent(joiner, { join_token: org.org_join_token }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).org_id).toBe(org.org_id);
    expect(await isMember(org.org_id, joiner.user_id)).toBe(true);
  });
});

describe('joinOrganisation: domain route', () => {
  it('joins the org that claimed the caller\'s verified email domain, with no token at all', async () => {
    const creator = await makeUser('JO_DomCreator');
    const joiner = await makeUser('JO_DomJoiner');
    const org = await makeOrg(creator, orgName('DomainJoin'));
    const domain = uniqueDomain('acme');
    await setOrgAccess(org.org_id, { domain_join_enabled: true });
    await claimOrgDomain(domain, org.org_id);
    await linkEmail(joiner, `joiner@${domain}`);

    const res: any = await joinOrg(joinEvent(joiner, {}));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).org_id).toBe(org.org_id);
    expect(await isMember(org.org_id, joiner.user_id)).toBe(true);
  });

  it('prefers the hd claim over the email domain when the two differ and both are claimed', async () => {
    const creator = await makeUser('JO_HdCreator');
    const joiner = await makeUser('JO_HdJoiner');
    const byEmail = await makeOrg(creator, orgName('EmailDomainOrg'));
    const byHd = await makeOrg(creator, orgName('HdDomainOrg'));
    const emailDomain = uniqueDomain('mail');
    const hdDomain = uniqueDomain('workspace');
    // Both domains resolve to a *different* org, so preferring the wrong one
    // does not merely fail — it lands the caller in the other org.
    await claimOrgDomain(emailDomain, byEmail.org_id);
    await claimOrgDomain(hdDomain, byHd.org_id);
    await linkEmail(joiner, `joiner@${emailDomain}`, hdDomain);

    const res: any = await joinOrg(joinEvent(joiner, {}));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).org_id).toBe(byHd.org_id);
    expect(await isMember(byHd.org_id, joiner.user_id)).toBe(true);
    expect(await isMember(byEmail.org_id, joiner.user_id)).toBe(false);
  });

  it('rejects EMAIL_REQUIRED — not ORG_NOT_FOUND — when a tokenless caller has no linked email', async () => {
    const creator = await makeUser('JO_NoEmailCreator');
    const joiner = await makeUser('JO_NoEmailJoiner');
    const org = await makeOrg(creator, orgName('NoEmailOrg'));
    await claimOrgDomain(uniqueDomain('unrelated'), org.org_id);

    const res: any = await joinOrg(joinEvent(joiner, {}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('EMAIL_REQUIRED');
    await expectNotAMember(org.org_id, joiner);
  });

  it('rejects ORG_NOT_FOUND when the caller has a domain but no org has claimed it', async () => {
    const creator = await makeUser('JO_UnclaimedCreator');
    const joiner = await makeUser('JO_UnclaimedJoiner');
    const org = await makeOrg(creator, orgName('UnclaimedOrg'));
    await linkEmail(joiner, `joiner@${uniqueDomain('unclaimed')}`);

    const res: any = await joinOrg(joinEvent(joiner, {}));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
    await expectNotAMember(org.org_id, joiner);
  });
});

describe('joinOrganisation: allowed-domain restriction', () => {
  it('refuses a *token* join from a domain the org does not allow', async () => {
    const creator = await makeUser('JO_GateCreator');
    const joiner = await makeUser('JO_GateJoiner');
    const org = await makeOrg(creator, orgName('GatedOrg'));
    const allowed = uniqueDomain('inside');
    await setOrgAccess(org.org_id, { restrict_to_allowed_domains: true, allowed_domains: [allowed] });
    await linkEmail(joiner, `joiner@${uniqueDomain('outside')}`);

    // Holding a valid, enabled token must not be enough — that is what makes
    // the restriction a gate rather than a suggestion.
    const res: any = await joinOrg(joinEvent(joiner, { join_token: org.org_join_token }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('DOMAIN_NOT_ALLOWED');
    await expectNotAMember(org.org_id, joiner);
  });

  it('admits a token join from an allowed domain', async () => {
    const creator = await makeUser('JO_AllowCreator');
    const joiner = await makeUser('JO_AllowJoiner');
    const org = await makeOrg(creator, orgName('AllowedOrg'));
    const allowed = uniqueDomain('inside');
    await setOrgAccess(org.org_id, { restrict_to_allowed_domains: true, allowed_domains: [allowed] });
    await linkEmail(joiner, `joiner@${allowed}`);

    const res: any = await joinOrg(joinEvent(joiner, { join_token: org.org_join_token }));
    expect(res.statusCode).toBe(200);
    expect(await isMember(org.org_id, joiner.user_id)).toBe(true);
  });

  it('tells an unlinked caller (EMAIL_REQUIRED) apart from a wrong-domain one (DOMAIN_NOT_ALLOWED)', async () => {
    const creator = await makeUser('JO_DistinctCreator');
    const unlinked = await makeUser('JO_DistinctUnlinked');
    const wrongDomain = await makeUser('JO_DistinctWrong');
    const org = await makeOrg(creator, orgName('DistinctOrg'));
    await setOrgAccess(org.org_id, {
      restrict_to_allowed_domains: true,
      allowed_domains: [uniqueDomain('inside')],
    });
    await linkEmail(wrongDomain, `joiner@${uniqueDomain('outside')}`);

    // Same org, same token, same refusal in plain English — the two callers
    // differ only in whether they have an email at all, and the codes must
    // say which.
    const a: any = await joinOrg(joinEvent(unlinked, { join_token: org.org_join_token }));
    const b: any = await joinOrg(joinEvent(wrongDomain, { join_token: org.org_join_token }));
    expect(JSON.parse(a.body).code).toBe('EMAIL_REQUIRED');
    expect(a.statusCode).toBe(400);
    expect(JSON.parse(b.body).code).toBe('DOMAIN_NOT_ALLOWED');
    expect(b.statusCode).toBe(403);
    expect(JSON.parse(a.body).code).not.toBe(JSON.parse(b.body).code);
    await expectNotAMember(org.org_id, unlinked);
    await expectNotAMember(org.org_id, wrongDomain);
  });

  it('applies the restriction on the domain route too, when hd resolves the org but the email domain is not allowed', async () => {
    const creator = await makeUser('JO_BothCreator');
    const joiner = await makeUser('JO_BothJoiner');
    const org = await makeOrg(creator, orgName('BothRoutesOrg'));
    const hdDomain = uniqueDomain('workspace');
    await setOrgAccess(org.org_id, {
      domain_join_enabled: true,
      restrict_to_allowed_domains: true,
      allowed_domains: [hdDomain],
    });
    await claimOrgDomain(hdDomain, org.org_id);
    // hd finds the org; the verified email sits on a domain the org does not
    // allow, and the allow-list is checked against that address.
    await linkEmail(joiner, `joiner@${uniqueDomain('contractor')}`, hdDomain);

    const res: any = await joinOrg(joinEvent(joiner, {}));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('DOMAIN_NOT_ALLOWED');
    await expectNotAMember(org.org_id, joiner);
  });

  it('ignores allowed_domains entirely while restrict_to_allowed_domains is off', async () => {
    const creator = await makeUser('JO_OffCreator');
    const joiner = await makeUser('JO_OffJoiner');
    const org = await makeOrg(creator, orgName('RestrictOffOrg'));
    await setOrgAccess(org.org_id, {
      restrict_to_allowed_domains: false,
      allowed_domains: [uniqueDomain('inside')],
    });
    await linkEmail(joiner, `joiner@${uniqueDomain('outside')}`);

    const res: any = await joinOrg(joinEvent(joiner, { join_token: org.org_join_token }));
    expect(res.statusCode).toBe(200);
    expect(await isMember(org.org_id, joiner.user_id)).toBe(true);
  });
});

describe('joinOrganisation: existing members', () => {
  it('still returns the org to a member whose domain the org has since stopped allowing', async () => {
    const creator = await makeUser('JO_LateRestrictCreator');
    const joiner = await makeUser('JO_LateRestrictJoiner');
    const org = await makeOrg(creator, orgName('LateRestrictOrg'));
    await linkEmail(joiner, `joiner@${uniqueDomain('outside')}`);
    await joinOrg(joinEvent(joiner, { join_token: org.org_join_token }));
    // The restriction arrives after they are already in. It governs who may
    // become a member, so it must not start failing `organisation join` for
    // the members the org already has.
    await setOrgAccess(org.org_id, {
      restrict_to_allowed_domains: true,
      allowed_domains: [uniqueDomain('inside')],
    });

    const res: any = await joinOrg(joinEvent(joiner, { join_token: org.org_join_token }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).org_id).toBe(org.org_id);
    expect(await isMember(org.org_id, joiner.user_id)).toBe(true);
  });

  it('refuses even an existing member the disabled token, since the token itself is the thing withdrawn', async () => {
    const creator = await makeUser('JO_MemberTokenOffCreator');
    const joiner = await makeUser('JO_MemberTokenOffJoiner');
    const org = await makeOrg(creator, orgName('MemberTokenOffOrg'));
    await joinOrg(joinEvent(joiner, { join_token: org.org_join_token }));
    await setOrgAccess(org.org_id, { join_token_enabled: false });

    const res: any = await joinOrg(joinEvent(joiner, { join_token: org.org_join_token }));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('JOIN_TOKEN_DISABLED');
    // Membership is untouched — the refusal is about the credential, not them.
    expect(await isMember(org.org_id, joiner.user_id)).toBe(true);
  });
});

describe('joinOrganisation: request shape', () => {
  it('rejects a blank join_token rather than silently joining by domain', async () => {
    const creator = await makeUser('JO_BlankCreator');
    const joiner = await makeUser('JO_BlankJoiner');
    const org = await makeOrg(creator, orgName('BlankTokenOrg'));
    const domain = uniqueDomain('blank');
    await claimOrgDomain(domain, org.org_id);
    await linkEmail(joiner, `joiner@${domain}`);

    const res: any = await joinOrg(joinEvent(joiner, { join_token: '   ' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
    await expectNotAMember(org.org_id, joiner);
  });
});

describe('joinOrganisation: unverified email', () => {
  // The linking path always marks an address verified, so these rows are only
  // reachable by hand — but an unverified address proves nothing about the
  // domain, and the guard that says so has to be observable or it will be
  // refactored away.
  async function putUnverifiedEmail(user: TestUser, email: string) {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: userMetaKey(user.user_id),
      UpdateExpression: 'SET email = :e, email_verified = :v',
      ConditionExpression: 'attribute_exists(pk)',
      ExpressionAttributeValues: { ':e': email, ':v': false },
    }));
  }

  it('will not satisfy an allow-list with an unverified address, even one on an allowed domain', async () => {
    const creator = await makeUser('JO_UnverifiedCreator');
    const joiner = await makeUser('JO_UnverifiedJoiner');
    const org = await makeOrg(creator, orgName('UnverifiedOrg'));
    const allowed = uniqueDomain('inside');
    await setOrgAccess(org.org_id, { restrict_to_allowed_domains: true, allowed_domains: [allowed] });
    await putUnverifiedEmail(joiner, `joiner@${allowed}`);

    const res: any = await joinOrg(joinEvent(joiner, { join_token: org.org_join_token }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('EMAIL_REQUIRED');
    await expectNotAMember(org.org_id, joiner);
  });

  it('will not resolve an org from an unverified address on the domain route', async () => {
    const creator = await makeUser('JO_UnverifiedDomCreator');
    const joiner = await makeUser('JO_UnverifiedDomJoiner');
    const org = await makeOrg(creator, orgName('UnverifDomOrg'));
    const domain = uniqueDomain('unverified');
    await setOrgAccess(org.org_id, { domain_join_enabled: true });
    await claimOrgDomain(domain, org.org_id);
    await putUnverifiedEmail(joiner, `joiner@${domain}`);

    const res: any = await joinOrg(joinEvent(joiner, {}));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('EMAIL_REQUIRED');
    await expectNotAMember(org.org_id, joiner);
  });
});

describe('joinOrganisation: stale domain claim', () => {
  it('returns ORG_NOT_FOUND when the claimed domain points at an org row that is gone', async () => {
    const joiner = await makeUser('JO_GhostJoiner');
    const ghost_org_id = `org-ghost-${randomUUID()}`;
    const domain = uniqueDomain('ghost');
    await claimOrgDomain(domain, ghost_org_id);
    await linkEmail(joiner, `joiner@${domain}`);

    const res: any = await joinOrg(joinEvent(joiner, {}));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
    await expectNotAMember(ghost_org_id, joiner);
  });
});
