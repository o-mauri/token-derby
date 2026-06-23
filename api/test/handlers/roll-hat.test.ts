import { describe, it, expect } from 'vitest';
import { handler as rollHandler } from '../../src/handlers/roll-hat.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';
import { getStableHorse, awardHorseXp } from '../../src/db/stable.js';
import { thresholdForLevel } from '@token-derby/shared';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

function rollEvent(user: TestUser, stable_horse_id: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /jockey/me/horses/{stable_horse_id}/roll',
    rawPath: `/jockey/me/horses/${stable_horse_id}/roll`,
    rawQueryString: '',
    pathParameters: { stable_horse_id },
    headers: {
      'content-type': 'application/json',
      'x-cli-version': CURRENT_CLI_VERSION,
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

describe('roll-hat handler', () => {
  it('refuses to roll for a brand-new level-1 horse (prevents farming via re-creation)', async () => {
    const user = await makeUser('RollUser_L1');
    const horse = await makeHorse(user, 'Storm');
    const res = await rollHandler(rollEvent(user, horse.stable_horse_id));
    expect(res.statusCode).toBe(402);
    expect(JSON.parse((res as any).body).code).toBe('INSUFFICIENT_ROLLS');
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    // No write should have happened.
    expect(after?.last_rolled_level).toBeUndefined();
  });

  it('grants exactly one roll on reaching level 2, then INSUFFICIENT_ROLLS', async () => {
    const user = await makeUser('RollUser_L2');
    const horse = await makeHorse(user, 'Lightning');
    await awardHorseXp(user.user_id, horse.stable_horse_id, thresholdForLevel(2));
    const first = await rollHandler(rollEvent(user, horse.stable_horse_id));
    expect(first.statusCode).toBe(200);
    const body = JSON.parse((first as any).body);
    expect(['hat', 'no_hat', 'duplicate']).toContain(body.result);
    expect(body.remaining_rolls).toBe(0);
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.last_rolled_level).toBe(2);
    const second = await rollHandler(rollEvent(user, horse.stable_horse_id));
    expect(second.statusCode).toBe(402);
    expect(JSON.parse((second as any).body).code).toBe('INSUFFICIENT_ROLLS');
  });

  it('still grants only 1 starter roll for a high-level horse (lazy migration is forward-only)', async () => {
    const user = await makeUser('RollUser_HighLevel');
    const horse = await makeHorse(user, 'Pegasus');
    // Boost the horse to exactly level 5 (no XP to spare).
    await awardHorseXp(user.user_id, horse.stable_horse_id, thresholdForLevel(5));
    const first = await rollHandler(rollEvent(user, horse.stable_horse_id));
    expect(first.statusCode).toBe(200);
    // Lazy migration started the horse at last_rolled_level=4, the roll bumped it to 5.
    // Any consolation XP awarded was less than what's needed to reach level 6,
    // so this should be exactly 5 (no cascade).
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.last_rolled_level).toBe(5);
    // A second roll attempt should fail with INSUFFICIENT_ROLLS.
    const second = await rollHandler(rollEvent(user, horse.stable_horse_id));
    expect(second.statusCode).toBe(402);
  });

  it('returns STABLE_HORSE_NOT_FOUND for an unknown horse', async () => {
    const user = await makeUser('RollUser_404');
    const res = await rollHandler(rollEvent(user, 'nonexistent_horse_id'));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse((res as any).body).code).toBe('STABLE_HORSE_NOT_FOUND');
  });
});
