import type { ApiHandler } from '../lib/http.js';
import type { RedeemClaimRequest, RedeemClaimResponse } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { getStableHorse, appendStableHorseHat, awardHorseXp } from '../db/stable.js';
import { redeemClaimSlot } from '../db/claims.js';
import { lookupClaim, decidePackOutcome } from '../lib/redeem-claim.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';

export const handler: ApiHandler = async (event) => {
  // The CLI bundles the hat catalog, so a stale CLI cannot name a newer hat.
  // Gate before anything else, so a rejected call never consumes a slot.
  const caller_version = readCliVersion(event);
  if (!caller_version || !meetsMinimumCliVersion(caller_version)) {
    return err('VERSION_MISMATCH', versionMismatchMessage());
  }

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

  const decision = decidePackOutcome(horse.hats ?? [], claim.entries, horse.xp);
  if (decision.result === 'unknown_hat') {
    return err('BAD_REQUEST', 'This claim references a hat or hat variant that no longer exists');
  }

  const slot = await redeemClaimSlot(claim, {
    user_id: auth.user_id,
    user_name: auth.display_name,
    horse_id: horse.stable_horse_id,
    horse_name: horse.name,
    outcome: decision.result,
    hat_id: decision.result === 'hat' ? decision.collected.id : decision.hat_id,
    variant: decision.result === 'hat' ? decision.collected.variant : decision.variant,
    xp_awarded: decision.result === 'duplicate' ? decision.xp_delta : undefined,
  });
  if (slot === 'already_redeemed') {
    return err('CLAIM_ALREADY_REDEEMED', 'You have already used this claim token');
  }
  if (slot === 'exhausted') {
    return err('CLAIM_EXHAUSTED', 'This claim token has been fully redeemed');
  }
  if (slot === 'conflict') {
    return err('RATE_LIMITED', 'Too many people are redeeming this claim right now. Try again in a moment.');
  }

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
    hat_id: decision.hat_id,
    xp_awarded: decision.xp_delta,
    new_xp: horse.xp + decision.xp_delta,
  };
  if (decision.variant !== undefined) response.variant = decision.variant;
  return ok(response);
};
