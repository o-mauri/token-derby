import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../../src/db/client.js';
import { orgMetaKey } from '../../src/db/keys.js';
import {
  getOrganisationById,
  getOrganisationByName,
  getOrganisationByJoinToken,
} from '../../src/db/organisations.js';

// Writes a META row exactly as it would have looked before Phase 3 (org
// access control) — no allowed_domains, join_token_enabled,
// domain_join_enabled, or restrict_to_allowed_domains attributes at all.
// Going through putOrganisation would not prove anything here: it only
// writes fields the caller passes, and every existing org in production
// predates this change, so this is the row shape readers must handle.
async function putLegacyOrg() {
  const org_id = `org-legacy-${randomUUID()}`;
  const org_name = `Legacy${randomUUID()}`;
  const org_join_token = `token-legacy-${randomUUID()}`;
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

function expectLegacyDefaults(org: { allowed_domains: string[]; join_token_enabled: boolean; domain_join_enabled: boolean; restrict_to_allowed_domains: boolean } | null) {
  expect(org).not.toBeNull();
  // Reading an absent join_token_enabled as anything but true would break
  // every existing org's join token the moment this ships.
  expect(org!.join_token_enabled).toBe(true);
  expect(org!.domain_join_enabled).toBe(false);
  // Reading an absent restrict_to_allowed_domains as truthy would lock every
  // existing org out, since its allow-list is empty.
  expect(org!.restrict_to_allowed_domains).toBe(false);
  expect(org!.allowed_domains).toEqual([]);
}

describe('legacy org rows get safe Phase 3 access-control defaults', () => {
  // All three readers funnel through pickOrgRecord — covering each
  // independently is what catches someone later inlining defaults into just
  // one of them and leaving the other two returning undefined.
  it('getOrganisationById defaults a legacy row', async () => {
    const { org_id } = await putLegacyOrg();
    expectLegacyDefaults(await getOrganisationById(org_id));
  });

  it('getOrganisationByName defaults a legacy row', async () => {
    const { org_name } = await putLegacyOrg();
    expectLegacyDefaults(await getOrganisationByName(org_name));
  });

  it('getOrganisationByJoinToken defaults a legacy row', async () => {
    const { org_join_token } = await putLegacyOrg();
    expectLegacyDefaults(await getOrganisationByJoinToken(org_join_token));
  });

  it('lowercases and trims allowed_domains on read', async () => {
    const org_id = `org-domains-${randomUUID()}`;
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: {
        ...orgMetaKey(org_id),
        org_id,
        org_name: `Domains${randomUUID()}`,
        created_at: new Date().toISOString(),
        creator_user_id: 'u-legacy',
        creator_user_name: 'Legacy Creator',
        org_join_token: `token-${randomUUID()}`,
        allowed_domains: ['  Acme.COM ', 'sub.Example.org'],
      },
    }));
    const org = await getOrganisationById(org_id);
    expect(org!.allowed_domains).toEqual(['acme.com', 'sub.example.org']);
  });
});
