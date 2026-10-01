import { describe, it, expect } from 'vitest';
import { lookupClaim } from '../../src/lib/redeem-claim.js';
import { putClaim, redeemClaimSlot } from '../../src/db/claims.js';
import { generateClaimCode } from '../../src/lib/claim-code.js';

function future(days = 30): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

describe('lookupClaim exhaustion and per-user checks', () => {
  it('rejects a claim whose slots are all taken', async () => {
    const claim = await putClaim({
      code: generateClaimCode(), item_type: 'hat',
      entries: [{ hat_id: 'flat_cap', variant: 0 }],
      max_redemptions: 1, expires_at: future(), created_by: 'admin',
    });
    await redeemClaimSlot(claim, {
      user_id: 'u-first', horse_id: 'sh-1', outcome: 'hat', hat_id: 'flat_cap', variant: 0,
    });
    const found = await lookupClaim(claim.code, 'u-second');
    expect(found.ok).toBe(false);
    if (found.ok) throw new Error('unreachable');
    expect(found.code).toBe('CLAIM_EXHAUSTED');
  });

  it('rejects a user who already redeemed this claim', async () => {
    const claim = await putClaim({
      code: generateClaimCode(), item_type: 'hat',
      entries: [{ hat_id: 'flat_cap', variant: 0 }],
      max_redemptions: 10, expires_at: future(), created_by: 'admin',
    });
    await redeemClaimSlot(claim, {
      user_id: 'u-repeat', horse_id: 'sh-1', outcome: 'hat', hat_id: 'flat_cap', variant: 0,
    });
    const found = await lookupClaim(claim.code, 'u-repeat');
    expect(found.ok).toBe(false);
    if (found.ok) throw new Error('unreachable');
    expect(found.code).toBe('CLAIM_ALREADY_REDEEMED');
  });

  it('still admits a different user while slots remain', async () => {
    const claim = await putClaim({
      code: generateClaimCode(), item_type: 'hat',
      entries: [{ hat_id: 'flat_cap', variant: 0 }],
      max_redemptions: 10, expires_at: future(), created_by: 'admin',
    });
    await redeemClaimSlot(claim, {
      user_id: 'u-one', horse_id: 'sh-1', outcome: 'hat', hat_id: 'flat_cap', variant: 0,
    });
    expect((await lookupClaim(claim.code, 'u-two')).ok).toBe(true);
  });
});
