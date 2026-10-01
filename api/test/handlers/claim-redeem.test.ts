import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION, OUTDATED_CLI_VERSION } from '../helpers/cli-version.js';
import { putClaim, getClaim, getClaimRedemption, redeemClaimSlot } from '../../src/db/claims.js';
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

function evAtVersion(user: TestUser, code: string, version: string | null, payload?: unknown): APIGatewayProxyEventV2 {
  const e = ev(user, code, payload) as any;
  if (version === null) delete e.headers['x-cli-version'];
  else e.headers['x-cli-version'] = version;
  return e as APIGatewayProxyEventV2;
}

function future(days = 30) { return new Date(Date.now() + days * 86_400_000).toISOString(); }
function past() { return new Date(Date.now() - 86_400_000).toISOString(); }

async function seedClaim(hat_id = 'flat_cap', variant: number | undefined = 0, expires_at = future()) {
  const entry = variant === undefined ? { hat_id } : { hat_id, variant };
  return putClaim({
    code: generateClaimCode(), item_type: 'hat', entries: [entry],
    max_redemptions: 1, expires_at, created_by: 'admin',
  });
}

async function seedPack(overrides: Partial<Parameters<typeof putClaim>[0]> = {}) {
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
    expect(body(res)).toEqual({ item_type: 'hat', entry_count: 1, remaining: 1 });
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

describe('get-claim probe reveals pack shape', () => {
  it('reports pack size and remaining slots without naming a hat', async () => {
    const user = await makeUser('Probe_PackShape');
    const claim = await seedPack({
      entries: [{ hat_id: 'flat_cap', variant: 0 }, { hat_id: 'beanie' }, { hat_id: 'fez' }],
      max_redemptions: 10,
    });
    const res = await probe(ev(user, claim.code));
    expect(body(res)).toEqual({ item_type: 'hat', entry_count: 3, remaining: 10 });
    expect(res.body).not.toContain('flat_cap');
    expect(res.body).not.toContain('beanie');
    expect(res.body).not.toContain('fez');
  });

  it('counts down remaining as slots are taken', async () => {
    const user = await makeUser('Probe_PackCountdown');
    const claim = await seedPack({ entries: [{ hat_id: 'flat_cap', variant: 0 }], max_redemptions: 3 });
    await redeemClaimSlot(claim, {
      user_id: 'u-1', horse_id: 'sh-1', outcome: 'hat', hat_id: 'flat_cap', variant: 0,
    });
    const res = await probe(ev(user, claim.code));
    expect(body(res).remaining).toBe(2);
  });

  it('reports one remaining for a fresh single-use claim', async () => {
    const user = await makeUser('Probe_PackFresh');
    const claim = await seedPack({ entries: [{ hat_id: 'flat_cap', variant: 0 }], max_redemptions: 1 });
    const res = await probe(ev(user, claim.code));
    expect(body(res).remaining).toBe(1);
  });

  it('never reports remaining below 1 on a successful probe', async () => {
    const user = await makeUser('Probe_PackFloor');
    const claim = await seedPack({ entries: [{ hat_id: 'flat_cap', variant: 0 }], max_redemptions: 2 });
    await redeemClaimSlot(claim, {
      user_id: 'u-1', horse_id: 'sh-1', outcome: 'hat', hat_id: 'flat_cap', variant: 0,
    });
    const res = await probe(ev(user, claim.code));
    expect(res.statusCode).toBe(200);
    expect(body(res).remaining).toBeGreaterThanOrEqual(1);
    expect(body(res).remaining).toBe(1);
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
    expect(after?.redeemed_count).toBe(1);
    const redemption = await getClaimRedemption(claim.code, user.user_id);
    expect(redemption?.horse_id).toBe(horse.stable_horse_id);
    expect(redemption?.horse_name).toBe('Dash');
    expect(redemption?.outcome).toBe('hat');
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

  // Pins the check order in lookupClaim: the redeemer of a single-slot claim
  // sees ALREADY_REDEEMED (above); anyone else sees EXHAUSTED.
  it('exhausts a single-slot claim for a different user once it is spoken for', async () => {
    const redeemer = await makeUser('Redeem_ExhaustRedeemer');
    const other = await makeUser('Redeem_ExhaustOther');
    const redeemerHorse = await makeHorse(redeemer, 'Gary');
    const otherHorse = await makeHorse(other, 'Dot');
    const claim = await seedClaim();
    expect((await redeem(ev(redeemer, claim.code, { stable_horse_id: redeemerHorse.stable_horse_id }))).statusCode).toBe(200);
    const res = await redeem(ev(other, claim.code, { stable_horse_id: otherHorse.stable_horse_id }));
    expect(res.statusCode).toBe(409);
    expect(body(res).code).toBe('CLAIM_EXHAUSTED');
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
    expect((await getClaim(claim.code))?.redeemed_count).toBe(0);
  });

  it('404s an unknown horse without burning the token', async () => {
    const user = await makeUser('Redeem_NoHorse');
    const horse = await makeHorse(user, 'Ghost');
    await deleteStableHorse(user.user_id, horse);
    const claim = await seedClaim();
    const res = await redeem(ev(user, claim.code, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(404);
    expect(body(res).code).toBe('STABLE_HORSE_NOT_FOUND');
    expect((await getClaim(claim.code))?.redeemed_count).toBe(0);
  });

  it('cannot redeem onto another user\'s horse', async () => {
    const owner = await makeUser('Redeem_Owner');
    const thief = await makeUser('Redeem_Thief');
    const horse = await makeHorse(owner, 'Prize');
    const claim = await seedClaim();
    const res = await redeem(ev(thief, claim.code, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(404);
    expect((await getClaim(claim.code))?.redeemed_count).toBe(0);
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


describe('claim endpoints gate on CLI version', () => {
  // The CLI bundles the hat catalog at build time, so a CLI older than a hat's
  // release cannot name it. Without this gate a stale CLI burns a redemption
  // slot and then prints "catalog mismatch" to the player.
  it('probe rejects an outdated CLI', async () => {
    const user = await makeUser('Gate_Outdated');
    const claim = await seedClaim();
    const res = await probe(evAtVersion(user, claim.code, OUTDATED_CLI_VERSION));
    expect(body(res).code).toBe('VERSION_MISMATCH');
  });

  it('probe rejects a request with no CLI version at all', async () => {
    const user = await makeUser('Gate_NoHeader');
    const claim = await seedClaim();
    const res = await probe(evAtVersion(user, claim.code, null));
    expect(body(res).code).toBe('VERSION_MISMATCH');
  });

  it('redeem rejects an outdated CLI WITHOUT consuming a slot', async () => {
    const user = await makeUser('Gate_NoSlot');
    const horse = await makeHorse(user, 'Gatekeeper');
    const claim = await seedClaim();
    const res = await redeem(evAtVersion(user, claim.code, OUTDATED_CLI_VERSION, { stable_horse_id: horse.stable_horse_id }));
    expect(body(res).code).toBe('VERSION_MISMATCH');
    // The slot is the thing that must survive a rejected call.
    expect((await getClaim(claim.code))?.redeemed_count).toBe(0);
    expect(await getClaimRedemption(claim.code, user.user_id)).toBeNull();
  });

  it('still admits a current CLI', async () => {
    const user = await makeUser('Gate_Current');
    const horse = await makeHorse(user, 'Uptodate');
    const claim = await seedClaim();
    expect((await probe(evAtVersion(user, claim.code, CURRENT_CLI_VERSION))).statusCode).toBe(200);
    const res = await redeem(evAtVersion(user, claim.code, CURRENT_CLI_VERSION, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(200);
  });
});
