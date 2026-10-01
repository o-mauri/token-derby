import { describe, it, expect, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { signSession } from '../../src/lib/admin-auth.js';
import { putClaim, redeemClaimSlot } from '../../src/db/claims.js';
import { generateClaimCode } from '../../src/lib/claim-code.js';
import { ddb, TABLE } from '../../src/db/client.js';
import { claimKey } from '../../src/db/keys.js';

const SECRET = 'redemptions-secret';
vi.mock('../../src/lib/admin-config.js', () => ({
  loadAdminConfig: vi.fn(async () => ({ username: 'omar', passwordHash: 'x:y', sessionSecret: SECRET })),
}));

import { handler } from '../../src/handlers/admin-list-claim-redemptions.js';

const token = () => signSession(SECRET, { sub: 'admin', exp: Math.floor(Date.now() / 1000) + 60 });

function future(days = 30): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function ev(code: string | undefined, withToken: boolean): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (withToken) headers['authorization'] = `Bearer ${token()}`;
  return {
    headers,
    pathParameters: code === undefined ? {} : { code },
  } as unknown as APIGatewayProxyEventV2;
}

const call = (code: string | undefined) => handler(ev(code, true));
const callUnauthenticated = (code: string | undefined) => handler(ev(code, false));
const body = (res: any) => JSON.parse(res.body);

async function seedPack(max_redemptions = 1) {
  return putClaim({
    code: generateClaimCode(),
    item_type: 'hat',
    entries: [{ hat_id: 'flat_cap', variant: 0 }],
    max_redemptions,
    expires_at: future(),
    created_by: 'admin',
  });
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

describe('admin-list-claim-redemptions', () => {
  it('requires an admin session', async () => {
    const res = await callUnauthenticated('SOMECODE1234');
    expect(res.statusCode).toBe(401);
  });

  it('returns an empty list for a claim nobody has redeemed', async () => {
    const claim = await seedPack(5);
    const res = await call(claim.code);
    expect(body(res).redemptions).toEqual([]);
  });

  it('returns each redeemer in redemption order', async () => {
    const claim = await seedPack(5);
    await redeemClaimSlot(claim, {
      user_id: 'u-1', user_name: 'Omar', horse_id: 'sh-1', horse_name: 'Thunderbolt',
      outcome: 'hat', hat_id: 'flat_cap', variant: 0,
    });
    await redeemClaimSlot(claim, {
      user_id: 'u-2', user_name: 'Alex', horse_id: 'sh-2', horse_name: 'Blue Streak',
      outcome: 'duplicate', hat_id: 'flat_cap', variant: 0, xp_awarded: 30,
    });
    const { redemptions } = body(await call(claim.code));
    expect(redemptions.map((r: { user_name: string }) => r.user_name)).toEqual(['Omar', 'Alex']);
    expect(redemptions[1].xp_awarded).toBe(30);
  });

  it('synthesises a redemption for a legacy row that has no REDEEM child', async () => {
    const code = generateClaimCode();
    await putRawLegacyClaim(code, {
      hat_id: 'flat_cap', variant: 0,
      redeemed_at: '2026-01-01T00:00:00.000Z',
      redeemed_by: 'u-legacy', redeemed_by_name: 'Omar',
      redeemed_horse_id: 'sh-old', redeemed_horse_name: 'Thunderbolt',
      outcome: 'hat',
    });
    const { redemptions } = body(await call(code));
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0].user_id).toBe('u-legacy');
    expect(redemptions[0].horse_name).toBe('Thunderbolt');
    expect(redemptions[0].outcome).toBe('hat');
  });

  it('returns nothing for an unredeemed legacy row', async () => {
    const code = generateClaimCode();
    await putRawLegacyClaim(code, { hat_id: 'flat_cap', variant: 0 });
    expect(body(await call(code)).redemptions).toEqual([]);
  });

  it('requires a code path parameter', async () => {
    expect((await call(undefined)).statusCode).toBe(400);
  });
});
