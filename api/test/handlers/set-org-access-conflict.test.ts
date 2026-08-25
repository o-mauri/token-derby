import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { OrgAccessSettings } from '@token-derby/shared';

// Two overlapping saves cannot be produced by seeding data: the handler re-reads
// the org row itself, so both requests would have to be in flight at once and
// which one wins would be down to timing. Instead the org read is stubbed to
// hand back a *stale* access_rev, which is exactly what the losing request holds
// when it reaches its write. Without this file the compare-and-swap would be a
// condition no test can fail, and the rollback it triggers unreachable.
const stale = vi.hoisted(() => ({ on: false, rev: undefined as number | undefined }));

vi.mock('../../src/db/organisations.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/db/organisations.js')>();
  return {
    ...actual,
    getOrganisationById: async (org_id: string, options?: { consistent?: boolean }) => {
      const org = await actual.getOrganisationById(org_id, options);
      if (!org || !stale.on) return org;
      return { ...org, access_rev: stale.rev };
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

const settings = (over: Partial<OrgAccessSettings> = {}): OrgAccessSettings => ({
  allowed_domains: [],
  join_token_enabled: true,
  domain_join_enabled: false,
  restrict_to_allowed_domains: false,
  ...over,
});

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

async function ownedOrg(prefix: string) {
  const owner = await makeUser(`O${rand()}`);
  const own = domain();
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

describe('setOrgAccess handler — losing the settings write to an overlapping save', () => {
  it('refuses with ACCESS_CONFLICT and leaves the winning settings stored', async () => {
    const org = await ownedOrg('CfBasic');
    stale.on = false;
    const winner = settings({ allowed_domains: [org.own], domain_join_enabled: true });
    expect((await handler(accessEvent(org.org_name, winner, org.owner)) as any).statusCode).toBe(200);

    // The losing request read the row before that save, so it still believes
    // the row has never been saved.
    stale.on = true;
    stale.rev = undefined;
    const res: any = await handler(accessEvent(org.org_name, settings({
      allowed_domains: [org.hd],
      domain_join_enabled: true,
    }), org.owner));
    stale.on = false;

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('ACCESS_CONFLICT');
    expect(await readAccess(org.org_name)).toEqual(winner);
  });

  // The refusal has to undo its own claims too. A row this request created for
  // a domain the stored settings never came to name is a live auto-join route
  // authorised by nothing.
  it('rolls back the claim row it created before losing the write', async () => {
    const org = await ownedOrg('CfRoll');
    stale.on = false;
    expect((await handler(accessEvent(org.org_name, settings({
      allowed_domains: [org.own],
      domain_join_enabled: true,
    }), org.owner)) as any).statusCode).toBe(200);

    stale.on = true;
    stale.rev = undefined;
    const res: any = await handler(accessEvent(org.org_name, settings({
      allowed_domains: [org.own, org.hd],
      domain_join_enabled: true,
    }), org.owner));
    stale.on = false;

    expect(res.statusCode).toBe(409);
    expect(await resolveOrgDomain(org.hd)).toBeNull();
    // The domain it came in holding is not one of its own rows, so the rollback
    // must not have dropped it.
    expect(await resolveOrgDomain(org.own)).toBe(org.org_id);
  });

  it('lets the refused save succeed once it re-reads the current revision', async () => {
    const org = await ownedOrg('CfRetry');
    stale.on = false;
    await handler(accessEvent(org.org_name, settings({
      allowed_domains: [org.own],
      domain_join_enabled: true,
    }), org.owner));

    stale.on = true;
    stale.rev = undefined;
    const refused: any = await handler(accessEvent(org.org_name, settings({
      allowed_domains: [org.hd],
      domain_join_enabled: true,
    }), org.owner));
    expect(refused.statusCode).toBe(409);

    stale.on = false;
    const retry: any = await handler(accessEvent(org.org_name, settings({
      allowed_domains: [org.hd],
      domain_join_enabled: true,
    }), org.owner));

    expect(retry.statusCode).toBe(200);
    expect(await resolveOrgDomain(org.hd)).toBe(org.org_id);
    expect(await resolveOrgDomain(org.own)).toBeNull();
  });
});
