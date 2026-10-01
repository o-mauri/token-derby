import { describe, it, expect } from 'vitest';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { putClaim, getClaim, redeemClaimSlot, getClaimRedemption, listClaimRedemptions } from '../../src/db/claims.js';
import { generateClaimCode } from '../../src/lib/claim-code.js';
import { ddb, TABLE } from '../../src/db/client.js';
import { claimKey } from '../../src/db/keys.js';

function future(days = 30): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function pack(max_redemptions = 1) {
  return putClaim({
    code: generateClaimCode(),
    item_type: 'hat',
    entries: [{ hat_id: 'flat_cap', variant: 0 }],
    max_redemptions,
    expires_at: future(),
    created_by: 'admin',
  });
}

const award = (user_id: string) => ({
  user_id,
  user_name: 'Omar',
  horse_id: 'sh-1',
  horse_name: 'Thunderbolt',
  outcome: 'hat' as const,
  hat_id: 'flat_cap',
  variant: 0,
});

describe('redeemClaimSlot', () => {
  it('awards the slot and increments the count', async () => {
    const claim = await pack(1);
    expect(await redeemClaimSlot(claim, award('u-1'))).toBe('won');
    expect((await getClaim(claim.code))?.redeemed_count).toBe(1);
  });

  it('rejects the same user twice', async () => {
    const claim = await pack(5);
    expect(await redeemClaimSlot(claim, award('u-1'))).toBe('won');
    expect(await redeemClaimSlot(claim, award('u-1'))).toBe('already_redeemed');
    expect((await getClaim(claim.code))?.redeemed_count).toBe(1);
  });

  it('rejects once the limit is reached', async () => {
    const claim = await pack(2);
    expect(await redeemClaimSlot(claim, award('u-1'))).toBe('won');
    expect(await redeemClaimSlot(claim, award('u-2'))).toBe('won');
    expect(await redeemClaimSlot(claim, award('u-3'))).toBe('exhausted');
    expect((await getClaim(claim.code))?.redeemed_count).toBe(2);
  });

  it('never overshoots the limit under concurrent redemption', async () => {
    const claim = await pack(3);
    // Drives the transaction directly: the advisory lookup checks would
    // otherwise mask whether the gate itself holds the line.
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => redeemClaimSlot(claim, award(`u-${i}`))),
    );
    expect(results.filter(r => r === 'won')).toHaveLength(3);
    expect(results.filter(r => r === 'exhausted')).toHaveLength(9);
    expect((await getClaim(claim.code))?.redeemed_count).toBe(3);
    expect(await listClaimRedemptions(claim.code)).toHaveLength(3);
  });

  it('stores the payout detail for the admin drill-down', async () => {
    const claim = await pack(1);
    await redeemClaimSlot(claim, { ...award('u-9'), outcome: 'duplicate', xp_awarded: 42 });
    const one = await getClaimRedemption(claim.code, 'u-9');
    expect(one?.outcome).toBe('duplicate');
    expect(one?.xp_awarded).toBe(42);
    expect(one?.horse_name).toBe('Thunderbolt');
    expect(Date.parse(one!.redeemed_at)).not.toBeNaN();
  });

  it('returns null for a user who has not redeemed', async () => {
    const claim = await pack(1);
    expect(await getClaimRedemption(claim.code, 'u-nobody')).toBeNull();
  });

  it('refuses a legacy row already stamped redeemed_at', async () => {
    const claim = await pack(1);
    await redeemClaimSlot(claim, award('u-1'));
    // Simulate the pre-pack shape: a redeemed_at stamp on META with a stale count.
    // The condition reads the real DB row, so stamp it there, not just in memory.
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: claimKey(claim.code),
      UpdateExpression: 'SET redeemed_at = :at',
      ExpressionAttributeValues: { ':at': '2026-01-01T00:00:00.000Z' },
    }));
    const stale = { ...claim, redeemed_count: 0, redeemed_at: '2026-01-01T00:00:00.000Z' };
    expect(await redeemClaimSlot(stale, award('u-2'))).toBe('exhausted');
  });
});
