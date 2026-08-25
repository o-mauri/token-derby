import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { handler } from '../../src/handlers/set-org-access.js';
import { handler as rotateHandler } from '../../src/handlers/rotate-org-join-token.js';
import { getOrganisationByName, getOrganisationByJoinToken, addMember } from '../../src/db/organisations.js';
import { resolveOrgDomain, claimOrgDomain, releaseOrgDomain } from '../../src/db/org-domains.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';
import type { OrgAccessSettings } from '@token-derby/shared';

const rand = () => Math.random().toString(36).slice(2, 8);
const orgName = (prefix: string) => `${prefix}${rand()}`.slice(0, 12);
const domain = () => `d${rand()}.example.com`;

function accessEvent(org_name: string, body: unknown, user: TestUser | null): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  return {
    version: '2.0',
    routeKey: 'PUT /organisations/{org_name}/access',
    rawPath: `/organisations/${org_name}/access`,
    rawQueryString: '',
    headers,
    pathParameters: { org_name },
    requestContext: {} as any,
    body: body === undefined ? undefined : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function rotateEvent(org_name: string, user: TestUser | null): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  return {
    version: '2.0',
    routeKey: 'POST /organisations/{org_name}/join-token/rotate',
    rawPath: `/organisations/${org_name}/join-token/rotate`,
    rawQueryString: '',
    headers,
    pathParameters: { org_name },
    requestContext: {} as any,
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

const settings = (over: Partial<OrgAccessSettings> = {}): OrgAccessSettings => ({
  allowed_domains: [],
  join_token_enabled: true,
  domain_join_enabled: false,
  restrict_to_allowed_domains: false,
  ...over,
});

async function readAccess(org_name: string): Promise<OrgAccessSettings> {
  const org = await getOrganisationByName(org_name);
  if (!org) throw new Error(`org ${org_name} vanished`);
  return {
    allowed_domains: org.allowed_domains,
    join_token_enabled: org.join_token_enabled,
    domain_join_enabled: org.domain_join_enabled,
    restrict_to_allowed_domains: org.restrict_to_allowed_domains,
  };
}

/** An owner with an org whose access settings are still at their defaults. */
async function ownedOrg(prefix: string) {
  const owner = await makeUser(`O${rand()}`);
  const org_name = orgName(prefix);
  const org_id = await createOrg(owner, org_name);
  return { owner, org_name, org_id };
}

describe('setOrgAccess handler — auth and validation', () => {
  it('rejects an unauthenticated caller', async () => {
    const { org_name } = await ownedOrg('AcAnon');
    const res: any = await handler(accessEvent(org_name, settings(), null));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
  });

  it('404s an unknown organisation', async () => {
    const user = await makeUser(`O${rand()}`);
    const res: any = await handler(accessEvent(orgName('AcNope'), settings(), user));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });

  // The load-bearing half is the second assertion: a handler that returned 403
  // *after* writing would pass a status-only check while having already changed
  // the org.
  it('rejects a non-owner member and writes nothing', async () => {
    const { org_name, org_id } = await ownedOrg('AcNotOwn');
    const intruder = await makeUser(`I${rand()}`);
    await addMember(org_id, intruder.user_id, new Date().toISOString());
    const before = await readAccess(org_name);
    const d = domain();

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [d],
      join_token_enabled: false,
      domain_join_enabled: true,
      restrict_to_allowed_domains: true,
    }), intruder));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_OWNER');
    expect(await readAccess(org_name)).toEqual(before);
    expect(await resolveOrgDomain(d)).toBeNull();
  });

  it('rejects a missing body', async () => {
    const { owner, org_name } = await ownedOrg('AcNoBody');
    const res: any = await handler(accessEvent(org_name, undefined, owner));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('rejects a non-boolean toggle rather than coercing it', async () => {
    const { owner, org_name } = await ownedOrg('AcCoerce');
    const res: any = await handler(accessEvent(org_name, { ...settings(), join_token_enabled: 'yes' }, owner));
    expect(res.statusCode).toBe(400);
    expect(await readAccess(org_name)).toEqual(settings());
  });

  it('rejects a value that is not a bare domain', async () => {
    const { owner, org_name } = await ownedOrg('AcBadDom');
    for (const bad of ['someone@acme.com', 'acme', 'https://acme.com', 'acme .com', '']) {
      const res: any = await handler(accessEvent(org_name, settings({ allowed_domains: [bad] }), owner));
      expect(res.statusCode, `expected "${bad}" to be refused`).toBe(400);
    }
    expect(await readAccess(org_name)).toEqual(settings());
  });

  it('lowercases, trims and dedupes the stored allow-list', async () => {
    const { owner, org_name } = await ownedOrg('AcNorm');
    const d = domain();
    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [`  ${d.toUpperCase()} `, d, `${d}`],
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).access.allowed_domains).toEqual([d]);
    expect((await readAccess(org_name)).allowed_domains).toEqual([d]);
  });
});

describe('setOrgAccess handler — the lockout combination', () => {
  // restrict_to_allowed_domains with an empty list is unsatisfiable by anyone,
  // owner included, and join-organisation cannot tell it from a deliberate
  // freeze — so the only place it can be caught is here.
  it('refuses restrict_to_allowed_domains with an empty allow-list, and writes nothing', async () => {
    const { owner, org_name } = await ownedOrg('AcLock');
    const before = await readAccess(org_name);

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [],
      restrict_to_allowed_domains: true,
    }), owner));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('ALLOW_LIST_REQUIRED');
    expect(await readAccess(org_name)).toEqual(before);
  });

  // The way an owner actually reaches the lockout: the restriction is already
  // on and working, and they delete the last domain from the list.
  it('refuses clearing the last domain while the restriction is on, keeping the working settings', async () => {
    const { owner, org_name } = await ownedOrg('AcLock2');
    const d = domain();
    const working = settings({ allowed_domains: [d], restrict_to_allowed_domains: true });
    await handler(accessEvent(org_name, working, owner));

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [],
      restrict_to_allowed_domains: true,
    }), owner));

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('ALLOW_LIST_REQUIRED');
    expect(await readAccess(org_name)).toEqual(working);
  });

  it('accepts the restriction once the allow-list is non-empty', async () => {
    const { owner, org_name } = await ownedOrg('AcLock3');
    const d = domain();
    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [d],
      restrict_to_allowed_domains: true,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(await readAccess(org_name)).toEqual(settings({
      allowed_domains: [d],
      restrict_to_allowed_domains: true,
    }));
  });
});

describe('setOrgAccess handler — domain claims', () => {
  it('claims one DOMAIN# row per allowed domain when domain join is switched on', async () => {
    const { owner, org_name, org_id } = await ownedOrg('AcClaim');
    const a = domain(), b = domain(), c = domain();

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [a, b, c],
      domain_join_enabled: true,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(a)).toBe(org_id);
    expect(await resolveOrgDomain(b)).toBe(org_id);
    expect(await resolveOrgDomain(c)).toBe(org_id);
  });

  it('claims nothing while domain join is off, even with domains listed', async () => {
    const { owner, org_name } = await ownedOrg('AcOff');
    const d = domain();

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [d],
      domain_join_enabled: false,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect((await readAccess(org_name)).allowed_domains).toEqual([d]);
    // The claim row is what join-organisation consults, so storing the domain
    // without claiming it is exactly what "off" has to mean.
    expect(await resolveOrgDomain(d)).toBeNull();
  });

  it('releases every claim when domain join is switched off', async () => {
    const { owner, org_name, org_id } = await ownedOrg('AcDisab');
    const a = domain(), b = domain();
    await handler(accessEvent(org_name, settings({ allowed_domains: [a, b], domain_join_enabled: true }), owner));
    expect(await resolveOrgDomain(a)).toBe(org_id);

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [a, b],
      domain_join_enabled: false,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(a)).toBeNull();
    expect(await resolveOrgDomain(b)).toBeNull();
    // The list itself survives — turning auto-join off is not the same as
    // forgetting which domains the owner configured.
    expect((await readAccess(org_name)).allowed_domains).toEqual([a, b]);
  });

  it('reconciles both directions when the list is edited while enabled', async () => {
    const { owner, org_name, org_id } = await ownedOrg('AcRecon');
    const kept = domain(), dropped = domain(), added = domain();
    await handler(accessEvent(org_name, settings({
      allowed_domains: [kept, dropped],
      domain_join_enabled: true,
    }), owner));
    expect(await resolveOrgDomain(dropped)).toBe(org_id);

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [kept, added],
      domain_join_enabled: true,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(added)).toBe(org_id);
    expect(await resolveOrgDomain(dropped)).toBeNull();
    expect(await resolveOrgDomain(kept)).toBe(org_id);
    expect((await readAccess(org_name)).allowed_domains).toEqual([kept, added]);
  });

  // A claim row left behind by a request that died mid-flight still routes
  // joiners to this org, and nothing else in the system ever looks at it. So
  // the release set is derived from the stored domain list alone, without
  // trusting the previous domain_join_enabled flag to say whether claims exist.
  it('releases a leftover claim even when domain join was already recorded as off', async () => {
    const { owner, org_name, org_id } = await ownedOrg('AcResid');
    const d = domain();
    await handler(accessEvent(org_name, settings({ allowed_domains: [d], domain_join_enabled: false }), owner));
    await claimOrgDomain(d, org_id);
    expect(await resolveOrgDomain(d)).toBe(org_id);

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [d],
      domain_join_enabled: false,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(d)).toBeNull();
  });

  it('is idempotent — re-saving the same settings keeps the claims', async () => {
    const { owner, org_name, org_id } = await ownedOrg('AcIdem');
    const d = domain();
    const body = settings({ allowed_domains: [d], domain_join_enabled: true });
    await handler(accessEvent(org_name, body, owner));

    const res: any = await handler(accessEvent(org_name, body, owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(d)).toBe(org_id);
  });

  it('re-claims a domain whose claim row was lost, without reporting a conflict', async () => {
    const { owner, org_name, org_id } = await ownedOrg('AcHeal');
    const d = domain();
    const body = settings({ allowed_domains: [d], domain_join_enabled: true });
    await handler(accessEvent(org_name, body, owner));
    // Simulates a request that died between claiming and storing: the row is
    // gone but the settings still say the domain is live.
    await releaseOrgDomain(d, org_id);
    expect(await resolveOrgDomain(d)).toBeNull();

    const res: any = await handler(accessEvent(org_name, body, owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(d)).toBe(org_id);
  });
});

describe('setOrgAccess handler — a domain another org already holds', () => {
  it('refuses with DOMAIN_ALREADY_CLAIMED naming the holding organisation', async () => {
    const holder = await ownedOrg('AcHold');
    const taken = domain();
    await handler(accessEvent(holder.org_name, settings({
      allowed_domains: [taken],
      domain_join_enabled: true,
    }), holder.owner));

    const rival = await ownedOrg('AcRival');
    const res: any = await handler(accessEvent(rival.org_name, settings({
      allowed_domains: [taken],
      domain_join_enabled: true,
    }), rival.owner));

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('DOMAIN_ALREADY_CLAIMED');
    // Naming the org, not its id — an id is not something an owner can act on.
    expect(body.message).toContain(holder.org_name);
    expect(body.message).toContain(taken);
  });

  it('leaves the claim with the original org', async () => {
    const holder = await ownedOrg('AcKeep');
    const taken = domain();
    await handler(accessEvent(holder.org_name, settings({
      allowed_domains: [taken],
      domain_join_enabled: true,
    }), holder.owner));

    const rival = await ownedOrg('AcSteal');
    await handler(accessEvent(rival.org_name, settings({
      allowed_domains: [taken],
      domain_join_enabled: true,
    }), rival.owner));

    expect(await resolveOrgDomain(taken)).toBe(holder.org_id);
  });

  // THE load-bearing test. A handler that claims as it goes and refuses on the
  // first conflict would still leave `free` claimed and — if it wrote settings
  // first — an org whose UI says domain join is on while only some of its
  // domains route to it. Asserting the error code alone would not see either.
  it('writes nothing at all — not the settings, not a partial set of claims', async () => {
    const holder = await ownedOrg('AcConfH');
    const taken = domain();
    await handler(accessEvent(holder.org_name, settings({
      allowed_domains: [taken],
      domain_join_enabled: true,
    }), holder.owner));

    const rival = await ownedOrg('AcConfR');
    const before = await readAccess(rival.org_name);
    const freeBefore = domain(), freeAfter = domain();

    const res: any = await handler(accessEvent(rival.org_name, settings({
      // The conflicting domain sits in the middle, so a claim-as-you-go handler
      // gets one claim in before it fails and has one left to skip.
      allowed_domains: [freeBefore, taken, freeAfter],
      domain_join_enabled: true,
      join_token_enabled: false,
    }), rival.owner));

    expect(JSON.parse(res.body).code).toBe('DOMAIN_ALREADY_CLAIMED');
    expect(await readAccess(rival.org_name)).toEqual(before);
    expect(await resolveOrgDomain(freeBefore)).toBeNull();
    expect(await resolveOrgDomain(freeAfter)).toBeNull();
  });

  // A claim made outside this handler is refused just the same — the DOMAIN#
  // row is the authority, not anything stored on the org. (The rollback path
  // for a claim that lands *after* the pre-flight read cannot be reached from
  // here; it is pinned in set-org-access-race.test.ts.)
  it('refuses a domain claimed outside the handler, and claims nothing alongside it', async () => {
    const rival = await ownedOrg('AcRace');
    const other = await ownedOrg('AcRaceO');
    const free = domain(), contested = domain();
    // Claimed directly, bypassing the handler, so the pre-flight in the call
    // below still sees it — this is the same state a lost race produces.
    await claimOrgDomain(contested, other.org_id);

    const res: any = await handler(accessEvent(rival.org_name, settings({
      allowed_domains: [free, contested],
      domain_join_enabled: true,
    }), rival.owner));

    expect(JSON.parse(res.body).code).toBe('DOMAIN_ALREADY_CLAIMED');
    expect(await resolveOrgDomain(free)).toBeNull();
    expect(await resolveOrgDomain(contested)).toBe(other.org_id);
  });

  it('lets an org re-list a domain it already holds itself', async () => {
    const { owner, org_name, org_id } = await ownedOrg('AcSelf');
    const d = domain();
    await handler(accessEvent(org_name, settings({ allowed_domains: [d], domain_join_enabled: true }), owner));

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [d, domain()],
      domain_join_enabled: true,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(d)).toBe(org_id);
  });
});

describe('rotateOrgJoinToken handler', () => {
  it('returns a new token and the old one stops resolving', async () => {
    const { owner, org_name, org_id } = await ownedOrg('AcRot');
    const before = await getOrganisationByName(org_name);
    const old_token = before!.org_join_token;

    const res: any = await rotateHandler(rotateEvent(org_name, owner));

    expect(res.statusCode).toBe(200);
    const { org_join_token } = JSON.parse(res.body);
    expect(org_join_token).not.toBe(old_token);
    // Queried through the GSI, not compared as a stored string: a rotation that
    // wrote the new value but left the index resolving the old one would look
    // correct in the response and still let the old link in.
    expect(await getOrganisationByJoinToken(old_token)).toBeNull();
    expect((await getOrganisationByJoinToken(org_join_token))?.org_id).toBe(org_id);
  });

  it('leaves a disabled token disabled', async () => {
    const { owner, org_name } = await ownedOrg('AcRotDis');
    await handler(accessEvent(org_name, settings({ join_token_enabled: false }), owner));

    const res: any = await rotateHandler(rotateEvent(org_name, owner));

    expect(res.statusCode).toBe(200);
    expect((await readAccess(org_name)).join_token_enabled).toBe(false);
    const { org_join_token } = JSON.parse(res.body);
    expect((await getOrganisationByJoinToken(org_join_token))?.join_token_enabled).toBe(false);
  });

  it('does not disturb the access settings', async () => {
    const { owner, org_name } = await ownedOrg('AcRotSet');
    const d = domain();
    await handler(accessEvent(org_name, settings({
      allowed_domains: [d],
      domain_join_enabled: true,
      restrict_to_allowed_domains: true,
    }), owner));
    const before = await readAccess(org_name);

    await rotateHandler(rotateEvent(org_name, owner));

    expect(await readAccess(org_name)).toEqual(before);
  });

  it('rejects a non-owner member and leaves the token intact', async () => {
    const { org_name, org_id } = await ownedOrg('AcRotNo');
    const intruder = await makeUser(`I${rand()}`);
    await addMember(org_id, intruder.user_id, new Date().toISOString());
    const old_token = (await getOrganisationByName(org_name))!.org_join_token;

    const res: any = await rotateHandler(rotateEvent(org_name, intruder));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_OWNER');
    expect((await getOrganisationByJoinToken(old_token))?.org_id).toBe(org_id);
  });

  it('rejects an unauthenticated caller', async () => {
    const { org_name } = await ownedOrg('AcRotAno');
    const res: any = await rotateHandler(rotateEvent(org_name, null));
    expect(res.statusCode).toBe(401);
  });

  it('404s an unknown organisation', async () => {
    const user = await makeUser(`O${rand()}`);
    const res: any = await rotateHandler(rotateEvent(orgName('AcRotNf'), user));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });
});
