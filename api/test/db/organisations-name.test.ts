import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE } from '../../src/db/client.js';
import { orgMetaKey } from '../../src/db/keys.js';
import { putOrganisation, getOrganisationByName, orgNameKey } from '../../src/db/organisations.js';

const uniqueName = () => `Org${randomUUID().replace(/-/g, '').slice(0, 10)}`;

async function makeOrg(org_name: string) {
  const org_id = randomUUID();
  await putOrganisation(
    { org_id, org_name, created_at: new Date().toISOString(), creator_user_id: 'u', creator_user_name: 'U' },
    randomUUID(),
  );
  return org_id;
}

describe('orgNameKey', () => {
  it('lower-cases the name', () => {
    expect(orgNameKey('StackOne')).toBe('stackone');
  });
});

describe('organisation name lookup', () => {
  it('stores the lower-cased key beside the display name', async () => {
    const name = uniqueName();
    const org_id = await makeOrg(name);
    const { Item } = await ddb.send(new GetCommand({ TableName: TABLE, Key: orgMetaKey(org_id) }));
    expect(Item?.org_name).toBe(name);
    expect(Item?.org_name_key).toBe(name.toLowerCase());
  });

  it('finds an org whatever the casing, keeping its display name', async () => {
    const name = uniqueName();
    const org_id = await makeOrg(name);
    for (const asked of [name, name.toLowerCase(), name.toUpperCase()]) {
      const org = await getOrganisationByName(asked);
      expect(org?.org_id).toBe(org_id);
      expect(org?.org_name).toBe(name);
    }
  });

  it('returns null for an unknown name', async () => {
    expect(await getOrganisationByName(uniqueName())).toBeNull();
  });
});
