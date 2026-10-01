import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { handler } from '../../src/handlers/set-org-access.js';
import { handler as rotateHandler } from '../../src/handlers/rotate-org-join-token.js';
import { getOrganisationByName, getOrganisationByJoinToken, addMember } from '../../src/db/organisations.js';
import { resolveOrgDomain, claimOrgDomain, releaseOrgDomain } from '../../src/db/org-domains.js';
import { attachEmailToUser } from '../../src/db/identities.js';
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

/** An owner with an org whose access settings are still at their defaults.
 *  The owner's Google link is what proves domain ownership, so every test that
 *  claims a domain has to say which domains this owner can prove: `own` comes
 *  from their verified email address and `hd` from the Workspace claim.
 *  `emailDomain` pins the email domain when a test needs two orgs able to prove
 *  the same one. */
async function ownedOrg(prefix: string, opts: { emailDomain?: string; hd?: string } = {}) {
  const owner = await makeUser(`O${rand()}`);
  const own = opts.emailDomain ?? domain();
  const hd = opts.hd ?? domain();
  await attachEmailToUser({
    user_id: owner.user_id,
    email: `owner-${rand()}@${own}`,
    idp_sub: `sub-${rand()}${rand()}`,
    hd,
  });
  const org_name = orgName(prefix);
  const org_id = await createOrg(owner, org_name);
  return { owner, org_name, org_id, own, hd };
}

/** An owner with no Google link at all — proves no domain. */
async function unlinkedOrg(prefix: string) {
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
  it('claims one DOMAIN# row per owned allowed domain when domain join is switched on', async () => {
    const { owner, org_name, org_id, own, hd } = await ownedOrg('AcClaim');

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [own, hd],
      domain_join_enabled: true,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(own)).toBe(org_id);
    expect(await resolveOrgDomain(hd)).toBe(org_id);
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
    const { owner, org_name, org_id, own, hd } = await ownedOrg('AcDisab');
    await handler(accessEvent(org_name, settings({ allowed_domains: [own, hd], domain_join_enabled: true }), owner));
    expect(await resolveOrgDomain(own)).toBe(org_id);

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [own, hd],
      domain_join_enabled: false,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(own)).toBeNull();
    expect(await resolveOrgDomain(hd)).toBeNull();
    // The list itself survives — turning auto-join off is not the same as
    // forgetting which domains the owner configured.
    expect((await readAccess(org_name)).allowed_domains).toEqual([own, hd]);
  });

  // An owner can only ever prove two domains (verified email plus the Workspace
  // hd claim), so add and drop are walked in sequence rather than in one save.
  it('reconciles both directions when the list is edited while enabled', async () => {
    const { owner, org_name, org_id, own, hd } = await ownedOrg('AcRecon');
    await handler(accessEvent(org_name, settings({
      allowed_domains: [own],
      domain_join_enabled: true,
    }), owner));
    expect(await resolveOrgDomain(own)).toBe(org_id);

    // Added: hd joins the list, own stays claimed.
    const added: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [own, hd],
      domain_join_enabled: true,
    }), owner));
    expect(added.statusCode).toBe(200);
    expect(await resolveOrgDomain(own)).toBe(org_id);
    expect(await resolveOrgDomain(hd)).toBe(org_id);

    // Dropped: own leaves the list and must lose its row, hd keeps its own.
    const dropped: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [hd],
      domain_join_enabled: true,
    }), owner));
    expect(dropped.statusCode).toBe(200);
    expect(await resolveOrgDomain(own)).toBeNull();
    expect(await resolveOrgDomain(hd)).toBe(org_id);
    expect((await readAccess(org_name)).allowed_domains).toEqual([hd]);
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
    const { owner, org_name, org_id, own: d } = await ownedOrg('AcIdem');
    const body = settings({ allowed_domains: [d], domain_join_enabled: true });
    await handler(accessEvent(org_name, body, owner));

    const res: any = await handler(accessEvent(org_name, body, owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(d)).toBe(org_id);
  });

  it('re-claims a domain whose claim row was lost, without reporting a conflict', async () => {
    const { owner, org_name, org_id, own: d } = await ownedOrg('AcHeal');
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

describe('setOrgAccess handler — ownership proof for auto-join', () => {
  // The squatting attack: nothing about org ownership or domain format says
  // anything about who owns bigcorp.com, so without this the first org to ask
  // becomes the destination for every verified bigcorp.com address.
  it('refuses a domain the creator cannot prove, and claims nothing', async () => {
    const { owner, org_name } = await ownedOrg('AcSquat');
    const someone_elses = domain();
    const before = await readAccess(org_name);

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [someone_elses],
      domain_join_enabled: true,
    }), owner));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('DOMAIN_NOT_VERIFIED');
    expect(await resolveOrgDomain(someone_elses)).toBeNull();
    expect(await readAccess(org_name)).toEqual(before);
  });

  // The other half of the same bug: once a squatter holds the row, the real
  // owner can never enable auto-join for its own domain and there is no admin
  // remedy. Refusing the squatter is what keeps this reachable.
  it('lets the domain\'s real owner claim it after a squatter has been refused', async () => {
    const contested = domain();
    const squatter = await ownedOrg('AcSqB');
    await handler(accessEvent(squatter.org_name, settings({
      allowed_domains: [contested],
      domain_join_enabled: true,
    }), squatter.owner));

    const real = await ownedOrg('AcSqReal', { emailDomain: contested });
    const res: any = await handler(accessEvent(real.org_name, settings({
      allowed_domains: [contested],
      domain_join_enabled: true,
    }), real.owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(contested)).toBe(real.org_id);
  });

  // The over-claim. The allow-list is a restriction list: two orgs may
  // legitimately restrict to the same partner domain. Claiming the whole list
  // meant whichever of them turned auto-join on locked the other out of a
  // domain it actually owns.
  it('claims only the owned domains, leaving a restriction-only entry free for its owner', async () => {
    const partner = domain();
    const a = await ownedOrg('AcPartA');

    const res: any = await handler(accessEvent(a.org_name, settings({
      allowed_domains: [a.own, partner],
      domain_join_enabled: true,
      restrict_to_allowed_domains: true,
    }), a.owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(a.own)).toBe(a.org_id);
    // Stored for the restriction, never claimed — it is not org A's domain.
    expect(await resolveOrgDomain(partner)).toBeNull();
    expect((await readAccess(a.org_name)).allowed_domains).toEqual([a.own, partner]);

    const b = await ownedOrg('AcPartB', { emailDomain: partner });
    const claim: any = await handler(accessEvent(b.org_name, settings({
      allowed_domains: [partner],
      domain_join_enabled: true,
    }), b.owner));

    expect(claim.statusCode).toBe(200);
    expect(await resolveOrgDomain(partner)).toBe(b.org_id);
  });

  it('accepts the Workspace hd claim as proof, not only the email domain', async () => {
    const { owner, org_name, org_id, hd } = await ownedOrg('AcHd');

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [hd],
      domain_join_enabled: true,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(hd)).toBe(org_id);
  });

  it('tells an unlinked creator to link an account rather than naming a domain', async () => {
    const { owner, org_name } = await unlinkedOrg('AcNoLink');
    const d = domain();

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [d],
      domain_join_enabled: true,
    }), owner));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('DOMAIN_NOT_VERIFIED');
    expect(JSON.parse(res.body).message.toLowerCase()).toContain('link a google account');
  });

  it('refuses auto-join with an empty allow-list rather than storing a toggle that claims nothing', async () => {
    const { owner, org_name } = await ownedOrg('AcEmptyAJ');
    const before = await readAccess(org_name);

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [],
      domain_join_enabled: true,
    }), owner));

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('DOMAIN_NOT_VERIFIED');
    expect(await readAccess(org_name)).toEqual(before);
  });

  // An unprovable entry does not block the save — an org must be able to
  // restrict to a partner domain while auto-joining its own.
  it('does not refuse when at least one listed domain is owned', async () => {
    const { owner, org_name, org_id, own } = await ownedOrg('AcMixed');
    const partner = domain();

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [partner, own],
      domain_join_enabled: true,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(own)).toBe(org_id);
    expect(await resolveOrgDomain(partner)).toBeNull();
  });
});

describe('setOrgAccess handler — healing an orphan claim row', () => {
  // The gap that made an orphan permanent: `stale` was derived from the stored
  // allow-list, so a claim row for a domain absent from that list was in no
  // release set and no later save could ever drop it — while
  // join-organisation kept routing that domain here, authorised by nothing.
  it('releases a claim row for a domain the stored settings never mention', async () => {
    const { owner, org_name, org_id, own } = await ownedOrg('AcOrphan');
    // A request that died between claiming and storing leaves exactly this:
    // the row exists, the settings know nothing about it.
    await handler(accessEvent(org_name, settings({ allowed_domains: [] }), owner));
    await claimOrgDomain(own, org_id);
    expect(await resolveOrgDomain(own)).toBe(org_id);

    const res: any = await handler(accessEvent(org_name, settings({ allowed_domains: [] }), owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(own)).toBeNull();
  });

  it('releases an orphan row while a different domain stays claimed', async () => {
    const { owner, org_name, org_id, own, hd } = await ownedOrg('AcOrphan2');
    await handler(accessEvent(org_name, settings({
      allowed_domains: [hd],
      domain_join_enabled: true,
    }), owner));
    await claimOrgDomain(own, org_id);

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [hd],
      domain_join_enabled: true,
    }), owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(own)).toBeNull();
    expect(await resolveOrgDomain(hd)).toBe(org_id);
  });

  // Reconciliation walks a wider candidate set than the stored list, so it has
  // to stay incapable of touching a row another org holds.
  it('never releases another org\'s claim while healing its own', async () => {
    const shared = domain();
    const other = await ownedOrg('AcOthr', { emailDomain: shared });
    await handler(accessEvent(other.org_name, settings({
      allowed_domains: [shared],
      domain_join_enabled: true,
    }), other.owner));
    expect(await resolveOrgDomain(shared)).toBe(other.org_id);

    // Same domain in this org's allow-list for restriction only — it is in the
    // release candidate set, and must still be untouchable.
    const mine = await ownedOrg('AcMine', { emailDomain: shared });
    const res: any = await handler(accessEvent(mine.org_name, settings({
      allowed_domains: [shared],
      restrict_to_allowed_domains: true,
    }), mine.owner));

    expect(res.statusCode).toBe(200);
    expect(await resolveOrgDomain(shared)).toBe(other.org_id);
  });
});

describe('setOrgAccess handler — a domain another org already holds', () => {
  it('refuses with DOMAIN_ALREADY_CLAIMED naming the holding organisation', async () => {
    const taken = domain();
    // Both creators hold a verified address at `taken`, so ownership proof is
    // satisfied for both and the refusal can only come from the claim row.
    const holder = await ownedOrg('AcHold', { emailDomain: taken });
    await handler(accessEvent(holder.org_name, settings({
      allowed_domains: [taken],
      domain_join_enabled: true,
    }), holder.owner));

    const rival = await ownedOrg('AcRival', { emailDomain: taken });
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
    const taken = domain();
    const holder = await ownedOrg('AcKeep', { emailDomain: taken });
    await handler(accessEvent(holder.org_name, settings({
      allowed_domains: [taken],
      domain_join_enabled: true,
    }), holder.owner));

    const rival = await ownedOrg('AcSteal', { emailDomain: taken });
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
    const taken = domain();
    const holder = await ownedOrg('AcConfH', { emailDomain: taken });
    await handler(accessEvent(holder.org_name, settings({
      allowed_domains: [taken],
      domain_join_enabled: true,
    }), holder.owner));

    const rival = await ownedOrg('AcConfR', { emailDomain: taken });
    const before = await readAccess(rival.org_name);

    const res: any = await handler(accessEvent(rival.org_name, settings({
      // The free domain the rival owns comes first, so a claim-as-you-go
      // handler gets one claim in before the conflict refuses it.
      allowed_domains: [rival.hd, taken],
      domain_join_enabled: true,
      join_token_enabled: false,
    }), rival.owner));

    expect(JSON.parse(res.body).code).toBe('DOMAIN_ALREADY_CLAIMED');
    expect(await readAccess(rival.org_name)).toEqual(before);
    expect(await resolveOrgDomain(rival.hd)).toBeNull();
  });

  // A claim made outside this handler is refused just the same — the DOMAIN#
  // row is the authority, not anything stored on the org. (The rollback path
  // for a claim that lands *after* the pre-flight read cannot be reached from
  // here; it is pinned in set-org-access-race.test.ts.)
  it('refuses a domain claimed outside the handler, and claims nothing alongside it', async () => {
    const contested = domain();
    const rival = await ownedOrg('AcRace', { emailDomain: contested });
    const other = await ownedOrg('AcRaceO');
    const free = rival.hd;
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
    const { owner, org_name, org_id, own: d, hd } = await ownedOrg('AcSelf');
    await handler(accessEvent(org_name, settings({ allowed_domains: [d], domain_join_enabled: true }), owner));

    const res: any = await handler(accessEvent(org_name, settings({
      allowed_domains: [d, hd],
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
    const { owner, org_name, own: d } = await ownedOrg('AcRotSet');
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
