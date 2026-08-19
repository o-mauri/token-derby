import { describe, it, expect } from 'vitest';
import { putClaim, getClaim, markClaimRedeemed, listClaims } from '../../src/db/claims.js';
import { generateClaimCode } from '../../src/lib/claim-code.js';

function future(days = 30): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

async function seed(overrides: Partial<Parameters<typeof putClaim>[0]> = {}) {
  return putClaim({
    code: generateClaimCode(),
    item_type: 'hat',
    hat_id: 'flat_cap',
    variant: 0,
    expires_at: future(),
    created_by: 'admin',
    ...overrides,
  });
}

describe('claim persistence', () => {
  it('round-trips a claim', async () => {
    const created = await seed();
    const read = await getClaim(created.code);
    expect(read?.hat_id).toBe('flat_cap');
    expect(read?.variant).toBe(0);
    expect(read?.item_type).toBe('hat');
    expect(read?.redeemed_at).toBeUndefined();
  });

  it('omits variant entirely for a legendary claim', async () => {
    const created = await seed({ hat_id: 'rainbow_crown', variant: undefined });
    const read = await getClaim(created.code);
    expect(read).not.toBeNull();
    expect('variant' in (read as object)).toBe(false);
  });

  it('returns null for an unknown code', async () => {
    expect(await getClaim(generateClaimCode())).toBeNull();
  });

  it('stamps a redemption and reports success', async () => {
    const created = await seed();
    const ok = await markClaimRedeemed(created.code, {
      redeemed_by: 'u-1',
      redeemed_by_name: 'Omar',
      redeemed_horse_id: 'sh-1',
      redeemed_horse_name: 'Gary',
      outcome: 'hat',
    });
    expect(ok).toBe(true);
    const read = await getClaim(created.code);
    expect(read?.redeemed_by).toBe('u-1');
    expect(read?.redeemed_horse_name).toBe('Gary');
    expect(read?.outcome).toBe('hat');
    expect(read?.redeemed_at).toBeTruthy();
  });

  it('refuses a second redemption', async () => {
    const created = await seed();
    const first = await markClaimRedeemed(created.code, {
      redeemed_by: 'u-1', redeemed_horse_id: 'sh-1', outcome: 'hat',
    });
    const second = await markClaimRedeemed(created.code, {
      redeemed_by: 'u-2', redeemed_horse_id: 'sh-2', outcome: 'hat',
    });
    expect(first).toBe(true);
    expect(second).toBe(false);
    const read = await getClaim(created.code);
    expect(read?.redeemed_by).toBe('u-1');
  });

  it('lets exactly one of ten concurrent redemptions win', async () => {
    const created = await seed();
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        markClaimRedeemed(created.code, {
          redeemed_by: `u-${i}`, redeemed_horse_id: `sh-${i}`, outcome: 'hat',
        }),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('reports false for an unknown code', async () => {
    const ok = await markClaimRedeemed(generateClaimCode(), {
      redeemed_by: 'u-1', redeemed_horse_id: 'sh-1', outcome: 'hat',
    });
    expect(ok).toBe(false);
  });

  it('lists created claims', async () => {
    const a = await seed();
    const b = await seed();
    const codes = (await listClaims()).map(c => c.code);
    expect(codes).toContain(a.code);
    expect(codes).toContain(b.code);
  });
});
