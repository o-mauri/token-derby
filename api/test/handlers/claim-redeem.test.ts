import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';
import { putClaim, getClaim } from '../../src/db/claims.js';
import { generateClaimCode } from '../../src/lib/claim-code.js';
import { formatClaimCode } from '@token-derby/shared';
import { getStableHorse, deleteStableHorse, awardHorseXp, appendStableHorseHat } from '../../src/db/stable.js';
import { thresholdForLevel } from '@token-derby/shared';
import { handler as probe } from '../../src/handlers/get-claim.js';
import { handler as redeem } from '../../src/handlers/redeem-claim.js';

const body = (res: any) => JSON.parse(res.body);

function ev(user: TestUser | null, code: string, payload?: unknown): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-cli-version': CURRENT_CLI_VERSION,
  };
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  return {
    headers,
    pathParameters: { code },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  } as unknown as APIGatewayProxyEventV2;
}

function future(days = 30) { return new Date(Date.now() + days * 86_400_000).toISOString(); }
function past() { return new Date(Date.now() - 86_400_000).toISOString(); }

async function seedClaim(hat_id = 'flat_cap', variant: number | undefined = 0, expires_at = future()) {
  return putClaim({ code: generateClaimCode(), item_type: 'hat', hat_id, variant, expires_at, created_by: 'admin' });
}

describe('get-claim probe', () => {
  it('requires authentication', async () => {
    const claim = await seedClaim();
    expect((await probe(ev(null, claim.code))).statusCode).toBe(401);
  });

  it('confirms a valid claim without revealing the hat', async () => {
    const user = await makeUser('Probe_Valid');
    const claim = await seedClaim();
    const res = await probe(ev(user, claim.code));
    expect(res.statusCode).toBe(200);
    expect(body(res)).toEqual({ item_type: 'hat' });
    expect(res.body).not.toContain('flat_cap');
  });

  it('accepts a dashed lowercase code', async () => {
    const user = await makeUser('Probe_Dashed');
    const claim = await seedClaim();
    const res = await probe(ev(user, formatClaimCode(claim.code).toLowerCase()));
    expect(res.statusCode).toBe(200);
  });

  it('404s an unknown code', async () => {
    const user = await makeUser('Probe_Unknown');
    const res = await probe(ev(user, generateClaimCode()));
    expect(res.statusCode).toBe(404);
    expect(body(res).code).toBe('CLAIM_NOT_FOUND');
  });

  it('404s a malformed code rather than 400', async () => {
    const user = await makeUser('Probe_Malformed');
    const res = await probe(ev(user, 'nope'));
    expect(res.statusCode).toBe(404);
    expect(body(res).code).toBe('CLAIM_NOT_FOUND');
  });

  it('410s an expired claim', async () => {
    const user = await makeUser('Probe_Expired');
    const claim = await seedClaim('flat_cap', 0, past());
    const res = await probe(ev(user, claim.code));
    expect(res.statusCode).toBe(410);
    expect(body(res).code).toBe('CLAIM_EXPIRED');
  });

  it('409s an already-redeemed claim', async () => {
    const user = await makeUser('Probe_Spent');
    const horse = await makeHorse(user, 'Gary');
    const claim = await seedClaim();
    await redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id }));
    const res = await probe(ev(user, claim.code));
    expect(res.statusCode).toBe(409);
    expect(body(res).code).toBe('CLAIM_ALREADY_REDEEMED');
  });
});

describe('redeem-claim', () => {
  it('requires authentication', async () => {
    const claim = await seedClaim();
    expect((await redeem(ev(null, claim.code, { stable_horse_id: 'x' }))).statusCode).toBe(401);
  });

  it('awards the hat and returns its index', async () => {
    const user = await makeUser('Redeem_Award');
    const horse = await makeHorse(user, 'Gary');
    const claim = await seedClaim();
    const res = await redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(200);
    const b = body(res);
    expect(b.result).toBe('hat');
    expect(b.collected.id).toBe('flat_cap');
    expect(b.collected.variant).toBe(0);
    expect(b.hat_index).toBe(0);
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.hats?.map(h => h.id)).toEqual(['flat_cap']);
  });

  it('does not consume a pending roll', async () => {
    const user = await makeUser('Redeem_NoRollBump');
    const horse = await makeHorse(user, 'Pony');
    await awardHorseXp(user.user_id, horse.stable_horse_id, thresholdForLevel(3));
    const claim = await seedClaim();
    await redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id }));
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.last_rolled_level).toBeUndefined();
  });

  it('records the redemption on the claim', async () => {
    const user = await makeUser('Redeem_Record');
    const horse = await makeHorse(user, 'Dash');
    const claim = await seedClaim();
    await redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id }));
    const after = await getClaim(claim.code);
    expect(after?.redeemed_by).toBe(user.user_id);
    expect(after?.redeemed_horse_id).toBe(horse.stable_horse_id);
    expect(after?.redeemed_horse_name).toBe('Dash');
    expect(after?.outcome).toBe('hat');
  });

  it('pays XP instead of a second copy on a duplicate', async () => {
    const user = await makeUser('Redeem_Dupe');
    const horse = await makeHorse(user, 'Twin');
    await awardHorseXp(user.user_id, horse.stable_horse_id, thresholdForLevel(3));
    await appendStableHorseHat(user.user_id, horse.stable_horse_id, {
      id: 'flat_cap', variant: 0, obtained_at: '2026-01-01T00:00:00.000Z',
    });
    const before = await getStableHorse(user.user_id, horse.stable_horse_id);
    const claim = await seedClaim();
    const res = await redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(200);
    const b = body(res);
    expect(b.result).toBe('duplicate');
    expect(b.hat_id).toBe('flat_cap');
    expect(b.xp_awarded).toBeGreaterThan(0);
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.hats).toHaveLength(1);
    expect(after?.xp).toBe((before?.xp ?? 0) + b.xp_awarded);
    expect(b.new_xp).toBe(after?.xp);
  });

  it('refuses a second redemption', async () => {
    const user = await makeUser('Redeem_Twice');
    const horse = await makeHorse(user, 'Gary');
    const claim = await seedClaim();
    expect((await redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id }))).statusCode).toBe(200);
    const second = await redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id }));
    expect(second.statusCode).toBe(409);
    expect(body(second).code).toBe('CLAIM_ALREADY_REDEEMED');
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.hats).toHaveLength(1);
  });

  it('awards exactly once under concurrent redemption', async () => {
    const user = await makeUser('Redeem_Concurrent');
    const horse = await makeHorse(user, 'Race');
    const claim = await seedClaim();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id })),
      ),
    );
    expect(results.filter(r => r.statusCode === 200)).toHaveLength(1);
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.hats).toHaveLength(1);
  });

  it('410s an expired claim without consuming it', async () => {
    const user = await makeUser('Redeem_Expired');
    const horse = await makeHorse(user, 'Gary');
    const claim = await seedClaim('flat_cap', 0, past());
    const res = await redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(410);
    expect((await getClaim(claim.code))?.redeemed_at).toBeUndefined();
  });

  it('404s an unknown horse without burning the token', async () => {
    const user = await makeUser('Redeem_NoHorse');
    const horse = await makeHorse(user, 'Ghost');
    await deleteStableHorse(user.user_id, horse);
    const claim = await seedClaim();
    const res = await redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(404);
    expect(body(res).code).toBe('STABLE_HORSE_NOT_FOUND');
    expect((await getClaim(claim.code))?.redeemed_at).toBeUndefined();
  });

  it('cannot redeem onto another user\'s horse', async () => {
    const owner = await makeUser('Redeem_Owner');
    const thief = await makeUser('Redeem_Thief');
    const horse = await makeHorse(owner, 'Prize');
    const claim = await seedClaim();
    const res = await redeem(ev(thief, claim.code, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(404);
    expect((await getClaim(claim.code))?.redeemed_at).toBeUndefined();
  });

  it('400s a missing stable_horse_id', async () => {
    const user = await makeUser('Redeem_NoBody');
    const claim = await seedClaim();
    expect((await redeem(ev(user, claim.code))).statusCode).toBe(400);
  });
});

describe('claim lookup rate limit', () => {
  it('429s after ten not-found lookups in one hour', async () => {
    const user = await makeUser('Limit_Brute');
    for (let i = 0; i < 10; i++) {
      const res = await probe(ev(user, generateClaimCode()));
      expect(res.statusCode, `attempt ${i + 1}`).toBe(404);
    }
    const res = await probe(ev(user, generateClaimCode()));
    expect(res.statusCode).toBe(429);
    expect(body(res).code).toBe('RATE_LIMITED');
  });

  it('does not charge budget for valid claims, even past the limit', async () => {
    const user = await makeUser('Limit_ValidPastLimit');
    const horse = await makeHorse(user, 'Gary');
    // More valid lookups than CLAIM_LOOKUP_LIMIT (10): if any charged budget,
    // later calls here would 429 instead of succeeding.
    for (let i = 0; i < 12; i++) {
      const claim = await seedClaim();
      expect((await probe(ev(user, claim.code))).statusCode).toBe(200);
    }
    const claim = await seedClaim();
    const res = await redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(200);
  });

  it('does not charge budget for an expired claim', async () => {
    const user = await makeUser('Limit_Expired');
    for (let i = 0; i < 12; i++) {
      const claim = await seedClaim('flat_cap', 0, past());
      expect((await probe(ev(user, claim.code))).statusCode).toBe(410);
    }
  });

  it('keys per user so one player cannot throttle another', async () => {
    const noisy = await makeUser('Limit_Noisy');
    const quiet = await makeUser('Limit_Quiet');
    for (let i = 0; i < 11; i++) await probe(ev(noisy, generateClaimCode()));
    const claim = await seedClaim();
    expect((await probe(ev(quiet, claim.code))).statusCode).toBe(200);
  });

  it('charges rate-limit budget for a malformed code, not just an unknown one', async () => {
    const user = await makeUser('Limit_Malformed');
    for (let i = 0; i < 10; i++) {
      const res = await probe(ev(user, 'nope'));
      expect(res.statusCode, `attempt ${i + 1}`).toBe(404);
    }
    const res = await probe(ev(user, 'nope'));
    expect(res.statusCode).toBe(429);
    expect(body(res).code).toBe('RATE_LIMITED');
  });

  it('shares one budget across probe and redeem', async () => {
    const user = await makeUser('Limit_Shared');
    for (let i = 0; i < 6; i++) await probe(ev(user, generateClaimCode()));
    for (let i = 0; i < 4; i++) {
      const res = await redeem(ev(user, generateClaimCode(), { stable_horse_id: 'sh-x' }));
      expect(res.statusCode).toBe(404);
    }
    expect((await probe(ev(user, generateClaimCode()))).statusCode).toBe(429);
  });
});
