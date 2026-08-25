import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { OrgAccessSettings } from '@token-derby/shared';

// The handler pre-flights every claim with a consistent read before it writes
// anything, so an ordinary conflict is refused before the first put and the
// rollback never runs. The rollback exists for the one case that read cannot
// see: another org claims the domain *between* the pre-flight and the guarded
// put. That window cannot be hit from a test by seeding data — the pre-flight
// would see it — so claimOrgDomain is stubbed to fail for exactly one domain.
// Without this file the rollback would be code no test can reach, and the
// "nothing is written on a conflict" guarantee would rest on the pre-flight
// alone.
const race = vi.hoisted(() => ({ contested: '', holder_org_id: '', claim_calls: [] as string[] }));

vi.mock('../../src/db/org-domains.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/org-domains.js')>();
  return {
    ...actual,
    claimOrgDomain: async (domain: string, org_id: string) => {
      race.claim_calls.push(domain);
      if (domain === race.contested) {
        throw new actual.DomainAlreadyClaimedError(domain, race.holder_org_id);
      }
      return actual.claimOrgDomain(domain, org_id);
    },
  };
});

import { handler } from '../../src/handlers/set-org-access.js';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { getOrganisationByName } from '../../src/db/organisations.js';
import { resolveOrgDomain } from '../../src/db/org-domains.js';
import { attachEmailToUser } from '../../src/db/identities.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

const rand = () => Math.random().toString(36).slice(2, 8);
const domain = () => `d${rand()}.example.com`;

function accessEvent(org_name: string, body: unknown, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'PUT /organisations/{org_name}/access',
    rawPath: `/organisations/${org_name}/access`,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    pathParameters: { org_name },
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

// Domain claims need the creator to prove the domain, so every owner here is
// linked: `own` comes from the verified address and `hd` from the Workspace
// claim. `emailDomain` pins the address when two orgs must both prove one.
async function ownedOrg(prefix: string, opts: { emailDomain?: string } = {}) {
  const owner = await makeUser(`O${rand()}`);
  const own = opts.emailDomain ?? domain();
  const hd = domain();
  await attachEmailToUser({
    user_id: owner.user_id,
    email: `owner-${rand()}@${own}`,
    idp_sub: `sub-${rand()}${rand()}`,
    hd,
  });
  const org_name = `${prefix}${rand()}`.slice(0, 12);
  const res: any = await createOrgHandler({
    version: '2.0',
    routeKey: 'POST /organisations',
    rawPath: '/organisations',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': owner.user_id,
      'x-user-token': owner.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify({ name: org_name }),
    isBase64Encoded: false,
  });
  if (res.statusCode !== 200) throw new Error(`create-org failed: ${res.body}`);
  return { owner, org_name, own, hd, org_id: JSON.parse(res.body).org_id as string };
}

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

describe('setOrgAccess handler — losing the claim race after the pre-flight read', () => {
  it('releases the claims it already made, writes no settings, and names the holder', async () => {
    const holder = await ownedOrg('RcHold');
    const rival = await ownedOrg('RcRival');
    const before = await readAccess(rival.org_name);

    const first = rival.own, contested = rival.hd;
    race.contested = contested;
    race.holder_org_id = holder.org_id;

    const res: any = await handler(accessEvent(rival.org_name, {
      allowed_domains: [first, contested],
      join_token_enabled: false,
      domain_join_enabled: true,
      restrict_to_allowed_domains: false,
    } satisfies OrgAccessSettings, rival.owner));

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('DOMAIN_ALREADY_CLAIMED');
    expect(body.message).toContain(holder.org_name);

    // `first` was genuinely claimed before the race was lost — this is the only
    // test that can prove the rollback puts it back.
    expect(await resolveOrgDomain(first)).toBeNull();
    expect(await readAccess(rival.org_name)).toEqual(before);
  });

  // Kills the mutation "delete the pre-flight read". Without it the handler
  // behaves identically from the outside — it claims the free domains, hits the
  // conflict, and rolls them back — so only counting the writes it attempts can
  // tell "nothing was written" from "everything was written and then undone".
  // The difference is not cosmetic: a rollback that never runs, because the
  // process died, leaves those claims live for an org whose request was refused.
  it('attempts no claim at all when a domain is already held by another org', async () => {
    const taken = domain();
    const holder = await ownedOrg('RcPreH', { emailDomain: taken });
    const rival = await ownedOrg('RcPreR', { emailDomain: taken });
    const free = rival.hd;

    race.contested = '';
    await handler(accessEvent(holder.org_name, {
      allowed_domains: [taken],
      join_token_enabled: true,
      domain_join_enabled: true,
      restrict_to_allowed_domains: false,
    } satisfies OrgAccessSettings, holder.owner));

    race.claim_calls = [];
    const res: any = await handler(accessEvent(rival.org_name, {
      allowed_domains: [free, taken],
      join_token_enabled: true,
      domain_join_enabled: true,
      restrict_to_allowed_domains: false,
    } satisfies OrgAccessSettings, rival.owner));

    expect(JSON.parse(res.body).code).toBe('DOMAIN_ALREADY_CLAIMED');
    expect(race.claim_calls).toEqual([]);
  });

  it('does not release a claim the org already held before the request', async () => {
    const holder = await ownedOrg('RcKeepH');
    const rival = await ownedOrg('RcKeepR');
    const held = rival.own, contested = rival.hd;

    race.contested = '';
    const first: any = await handler(accessEvent(rival.org_name, {
      allowed_domains: [held],
      join_token_enabled: true,
      domain_join_enabled: true,
      restrict_to_allowed_domains: false,
    } satisfies OrgAccessSettings, rival.owner));
    expect(first.statusCode).toBe(200);
    expect(await resolveOrgDomain(held)).toBe(rival.org_id);

    race.contested = contested;
    race.holder_org_id = holder.org_id;
    const res: any = await handler(accessEvent(rival.org_name, {
      allowed_domains: [held, contested],
      join_token_enabled: true,
      domain_join_enabled: true,
      restrict_to_allowed_domains: false,
    } satisfies OrgAccessSettings, rival.owner));

    expect(res.statusCode).toBe(409);
    // A rollback that released every desired domain rather than only the rows
    // this request created would silently unclaim a live domain — the org would
    // stop auto-joining anyone, from a request that failed.
    expect(await resolveOrgDomain(held)).toBe(rival.org_id);
  });
});
