import { describe, it, expect, vi, afterEach } from 'vitest';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { putClaim, getClaim, listClaims, redeemClaimSlot } from '../../src/db/claims.js';
import { generateClaimCode } from '../../src/lib/claim-code.js';
import { ddb, TABLE } from '../../src/db/client.js';
import { claimKey } from '../../src/db/keys.js';

function future(days = 30): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function putRawLegacyClaim(code: string, fields: Record<string, unknown>) {
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: {
      ...claimKey(code),
      code,
      item_type: 'hat',
      created_at: '2026-01-01T00:00:00.000Z',
      created_by: 'admin',
      expires_at: future(),
      ...fields,
    },
  }));
}

async function seed(overrides: Partial<Parameters<typeof putClaim>[0]> = {}) {
  return putClaim({
    code: generateClaimCode(),
    item_type: 'hat',
    entries: [{ hat_id: 'flat_cap', variant: 0 }],
    max_redemptions: 1,
    expires_at: future(),
    created_by: 'admin',
    ...overrides,
  });
}

describe('claim persistence', () => {
  it('round-trips a claim', async () => {
    const created = await seed();
    const read = await getClaim(created.code);
    expect(read?.entries[0]).toEqual({ hat_id: 'flat_cap', variant: 0 });
    expect(read?.item_type).toBe('hat');
    expect(read?.redeemed_at).toBeUndefined();
  });

  it('omits variant entirely for a legendary claim', async () => {
    const created = await seed({ entries: [{ hat_id: 'rainbow_crown' }] });
    const read = await getClaim(created.code);
    expect(read).not.toBeNull();
    expect('variant' in (read?.entries[0] as object)).toBe(false);
  });

  it('returns null for an unknown code', async () => {
    expect(await getClaim(generateClaimCode())).toBeNull();
  });

  it('lists created claims', async () => {
    const a = await seed();
    const b = await seed();
    const codes = (await listClaims()).map(c => c.code);
    expect(codes).toContain(a.code);
    expect(codes).toContain(b.code);
  });
});

describe('pack claims', () => {
  it('round-trips entries and a redemption limit', async () => {
    const created = await putClaim({
      code: generateClaimCode(),
      item_type: 'hat',
      entries: [{ hat_id: 'flat_cap', variant: 0 }, { hat_id: 'beanie' }],
      max_redemptions: 10,
      expires_at: future(),
      created_by: 'admin',
    });
    const read = await getClaim(created.code);
    expect(read?.entries).toEqual([{ hat_id: 'flat_cap', variant: 0 }, { hat_id: 'beanie' }]);
    expect(read?.max_redemptions).toBe(10);
    expect(read?.redeemed_count).toBe(0);
  });

  it('normalises an unredeemed legacy row into a one-entry pack', async () => {
    const code = generateClaimCode();
    await putRawLegacyClaim(code, { hat_id: 'flat_cap', variant: 2 });
    const read = await getClaim(code);
    expect(read?.entries).toEqual([{ hat_id: 'flat_cap', variant: 2 }]);
    expect(read?.max_redemptions).toBe(1);
    expect(read?.redeemed_count).toBe(0);
  });

  it('normalises an already-redeemed legacy row as fully spent', async () => {
    const code = generateClaimCode();
    await putRawLegacyClaim(code, { hat_id: 'flat_cap', variant: 0, redeemed_at: '2026-01-01T00:00:00.000Z' });
    const read = await getClaim(code);
    expect(read?.redeemed_count).toBe(1);
    expect(read?.max_redemptions).toBe(1);
  });

  it('normalises a legacy row with no variant', async () => {
    const code = generateClaimCode();
    await putRawLegacyClaim(code, { hat_id: 'rainbow_crown' });
    const read = await getClaim(code);
    expect(read?.entries).toEqual([{ hat_id: 'rainbow_crown' }]);
  });
});

// DynamoDB Local never emits TransactionConflict, so these classify the
// retry behaviour against an injected error shaped like the real one.
describe('redeemClaimSlot conflict retry', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  function conflictError(): any {
    const e: any = new Error('Transaction cancelled');
    e.name = 'TransactionCanceledException';
    e.CancellationReasons = [{ Code: 'None' }, { Code: 'TransactionConflict' }];
    return e;
  }

  function conditionalCheckFailed(onUpdate: boolean): any {
    const e: any = new Error('Transaction cancelled');
    e.name = 'TransactionCanceledException';
    e.CancellationReasons = onUpdate
      ? [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }]
      : [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }];
    return e;
  }

  it('retries a TransactionConflict and succeeds on a later attempt', async () => {
    const claim = await seed();
    const sendSpy = vi.spyOn(ddb, 'send');
    sendSpy.mockRejectedValueOnce(conflictError());
    sendSpy.mockRejectedValueOnce(conflictError());
    const result = await redeemClaimSlot(claim, {
      user_id: 'u-retry-succeed', horse_id: 'sh-1', outcome: 'hat', hat_id: 'flat_cap', variant: 0,
    });
    expect(result).toBe('won');
    expect(sendSpy).toHaveBeenCalledTimes(3);
  });

  it('returns "conflict" after exhausting all retry attempts', async () => {
    const claim = await seed();
    const sendSpy = vi.spyOn(ddb, 'send');
    sendSpy.mockRejectedValue(conflictError());
    const result = await redeemClaimSlot(claim, {
      user_id: 'u-retry-exhaust', horse_id: 'sh-1', outcome: 'hat', hat_id: 'flat_cap', variant: 0,
    });
    expect(result).toBe('conflict');
    expect(sendSpy).toHaveBeenCalledTimes(4);
  });

  it('does not retry a ConditionalCheckFailed on the slot-limit update', async () => {
    const claim = await seed();
    const sendSpy = vi.spyOn(ddb, 'send');
    sendSpy.mockRejectedValueOnce(conditionalCheckFailed(true));
    const result = await redeemClaimSlot(claim, {
      user_id: 'u-retry-exhausted-claim', horse_id: 'sh-1', outcome: 'hat', hat_id: 'flat_cap', variant: 0,
    });
    expect(result).toBe('exhausted');
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });

  it('does not retry a ConditionalCheckFailed on the redemption Put', async () => {
    const claim = await seed();
    const sendSpy = vi.spyOn(ddb, 'send');
    sendSpy.mockRejectedValueOnce(conditionalCheckFailed(false));
    const result = await redeemClaimSlot(claim, {
      user_id: 'u-retry-already-redeemed', horse_id: 'sh-1', outcome: 'hat', hat_id: 'flat_cap', variant: 0,
    });
    expect(result).toBe('already_redeemed');
    expect(sendSpy).toHaveBeenCalledTimes(1);
  });
});
