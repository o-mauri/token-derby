import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { RollHatResponse } from '@token-derby/shared';
import { levelFromXp, levelInfo } from '@token-derby/shared';
import { authenticate } from '../lib/auth.js';
import { getStableHorse, applyRollResult } from '../db/stable.js';
import { rollHat, DUPLICATE_XP_FRACTION, NO_HAT_XP_FRACTION } from '../lib/roll-hat.js';
import { ok, err } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const stable_horse_id = event.pathParameters?.stable_horse_id;
  if (!stable_horse_id) return err('BAD_REQUEST', 'stable_horse_id path parameter required');

  const horse = await getStableHorse(auth.user_id, stable_horse_id);
  if (!horse) return err('STABLE_HORSE_NOT_FOUND', 'No such horse in your stable');

  // Rolls accrue when a horse levels up from level 1 onwards — a fresh
  // level-1 horse has zero pending rolls, otherwise you could farm rolls by
  // spawning new horses. Lazy migration: legacy horses (no `last_rolled_level`
  // field) at level ≥ 2 still get exactly 1 starter roll (not retroactive).
  const currentLevel = levelFromXp(horse.xp);
  const lastRolledLevel = horse.last_rolled_level ?? Math.max(1, currentLevel - 1);
  const eligible = currentLevel - lastRolledLevel;
  if (eligible <= 0) {
    return err('INSUFFICIENT_ROLLS', 'No pending rolls. Level up to earn more.');
  }

  const inventory = horse.hats ?? [];
  const decision = rollHat(inventory);

  const info = levelInfo(horse.xp);
  const xpSlice = info.xp_for_level ?? 0;

  if (decision.result === 'hat') {
    await applyRollResult(auth.user_id, stable_horse_id, {
      expected_last_rolled_level: lastRolledLevel,
      append_hat: decision.collected,
    });
    const response: RollHatResponse = {
      result: 'hat',
      collected: decision.collected,
      hat_index: inventory.length,
      remaining_rolls: eligible - 1,
    };
    return ok(response);
  }

  if (decision.result === 'duplicate') {
    const xp_delta = Math.round(xpSlice * DUPLICATE_XP_FRACTION[decision.hat.rarity]);
    await applyRollResult(auth.user_id, stable_horse_id, {
      expected_last_rolled_level: lastRolledLevel,
      xp_delta,
    });
    const response: RollHatResponse = {
      result: 'duplicate',
      hat_id: decision.hat_id,
      variant: decision.variant,
      xp_awarded: xp_delta,
      new_xp: horse.xp + xp_delta,
      remaining_rolls: eligible - 1,
    };
    return ok(response);
  }

  // no_hat
  const xp_delta = Math.round(xpSlice * NO_HAT_XP_FRACTION);
  await applyRollResult(auth.user_id, stable_horse_id, {
    expected_last_rolled_level: lastRolledLevel,
    xp_delta,
  });
  const response: RollHatResponse = {
    result: 'no_hat',
    xp_awarded: xp_delta,
    new_xp: horse.xp + xp_delta,
    remaining_rolls: eligible - 1,
  };
  return ok(response);
};
