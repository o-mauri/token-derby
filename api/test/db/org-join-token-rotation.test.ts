import { describe, it, expect } from 'vitest';
import {
  putOrganisation, rotateJoinToken, getOrganisationByJoinToken, getOrganisationById,
} from '../../src/db/organisations.js';
import { ddb, TABLE } from '../../src/db/client.js';
import { orgMetaKey } from '../../src/db/keys.js';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

async function seedOrg(join_token_enabled?: boolean) {
  const org_id = `org-rot-${Math.random().toString(36).slice(2)}`;
  const creator = `u-rot-${Math.random().toString(36).slice(2)}`;
  const original_token = `join-token-${org_id}`;
  await putOrganisation(
    {
      org_id,
      org_name: `Rot${Math.random().toString(36).slice(2, 8)}`,
      created_at: new Date().toISOString(),
      creator_user_id: creator,
      creator_user_name: 'Creator',
    },
    original_token,
  );
  if (join_token_enabled !== undefined) {
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: orgMetaKey(org_id),
      UpdateExpression: 'SET join_token_enabled = :v',
      ExpressionAttributeValues: { ':v': join_token_enabled },
    }));
  }
  return { org_id, original_token };
}

describe('rotateJoinToken', () => {
  it('returns a token different from the previous one', async () => {
    const { org_id, original_token } = await seedOrg();

    const new_token = await rotateJoinToken(org_id);

    expect(new_token).not.toBe(original_token);
  });

  // The load-bearing assertion. org_join_token is queried through
  // OrgJoinTokenIndex (a GSI), not read off the org row directly, so a
  // rotation that only overwrote the stored value but left a stale index
  // entry for the old token would pass a naive "stored value changed" check
  // while still letting the old token resolve to the org. Querying the index
  // is the only way to catch that.
  it('stops the old token resolving via getOrganisationByJoinToken', async () => {
    const { org_id, original_token } = await seedOrg();

    await rotateJoinToken(org_id);

    expect(await getOrganisationByJoinToken(original_token)).toBeNull();
  });

  it('resolves the new token to the same org', async () => {
    const { org_id } = await seedOrg();

    const new_token = await rotateJoinToken(org_id);

    const resolved = await getOrganisationByJoinToken(new_token);
    expect(resolved).not.toBeNull();
    expect(resolved!.org_id).toBe(org_id);
  });

  it('does not change join_token_enabled when it was on', async () => {
    const { org_id } = await seedOrg(true);

    await rotateJoinToken(org_id);

    expect((await getOrganisationById(org_id))!.join_token_enabled).toBe(true);
  });

  it('does not change join_token_enabled when it was off — rotating a disabled token is legal and stays disabled', async () => {
    const { org_id } = await seedOrg(false);

    await rotateJoinToken(org_id);

    expect((await getOrganisationById(org_id))!.join_token_enabled).toBe(false);
  });

  it('rotating twice yields three distinct tokens and only the newest resolves', async () => {
    const { org_id, original_token } = await seedOrg();

    const second_token = await rotateJoinToken(org_id);
    const third_token = await rotateJoinToken(org_id);

    expect(new Set([original_token, second_token, third_token]).size).toBe(3);

    expect(await getOrganisationByJoinToken(original_token)).toBeNull();
    expect(await getOrganisationByJoinToken(second_token)).toBeNull();

    const resolved = await getOrganisationByJoinToken(third_token);
    expect(resolved).not.toBeNull();
    expect(resolved!.org_id).toBe(org_id);
  });
});
