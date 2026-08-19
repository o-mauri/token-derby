import type { ApiHandler } from '../lib/http.js';
import type { RedeemClaimRequest, RedeemClaimResponse } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { getStableHorse, appendStableHorseHat, awardHorseXp } from '../db/stable.js';
import { markClaimRedeemed } from '../db/claims.js';
import { lookupClaim, decideClaimOutcome } from '../lib/redeem-claim.js';
import { ok, err, parseJson } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const rawCode = event.pathParameters?.code;
  if (!rawCode) return err('BAD_REQUEST', 'code path parameter required');

  const body = parseJson<RedeemClaimRequest>(event.body);
  if (!body?.stable_horse_id) return err('BAD_REQUEST', 'stable_horse_id required');

  const found = await lookupClaim(rawCode, auth.user_id);
  if (!found.ok) return err(found.code, found.message);
  const claim = found.claim;

  // Resolve the horse before consuming the token, so a deleted horse or a
  // wrong owner can never burn the claim.
  const horse = await getStableHorse(auth.user_id, body.stable_horse_id);
  if (!horse) return err('STABLE_HORSE_NOT_FOUND', 'No such horse in your stable');

  const decision = decideClaimOutcome(horse.hats ?? [], claim.hat_id, claim.variant, horse.xp);
  if (decision.result === 'unknown_hat') {
    return err('BAD_REQUEST', 'This claim references a hat that no longer exists');
  }

  // The conditional stamp is the single-use gate; everything after it is the
  // payout for the one caller that won.
  const won = await markClaimRedeemed(claim.code, {
    redeemed_by: auth.user_id,
    redeemed_by_name: auth.display_name,
    redeemed_horse_id: horse.stable_horse_id,
    redeemed_horse_name: horse.name,
    outcome: decision.result,
    xp_awarded: decision.result === 'duplicate' ? decision.xp_delta : undefined,
  });
  if (!won) return err('CLAIM_ALREADY_REDEEMED', 'This claim token has already been used');

  if (decision.result === 'hat') {
    const hat_index = await appendStableHorseHat(auth.user_id, horse.stable_horse_id, decision.collected);
    if (hat_index === null) return err('STABLE_HORSE_NOT_FOUND', 'No such horse in your stable');
    const response: RedeemClaimResponse = {
      result: 'hat',
      collected: decision.collected,
      hat_index,
    };
    return ok(response);
  }

  await awardHorseXp(auth.user_id, horse.stable_horse_id, decision.xp_delta);
  const response: RedeemClaimResponse = {
    result: 'duplicate',
    hat_id: claim.hat_id,
    xp_awarded: decision.xp_delta,
    new_xp: horse.xp + decision.xp_delta,
  };
  if (claim.variant !== undefined) response.variant = claim.variant;
  return ok(response);
};
