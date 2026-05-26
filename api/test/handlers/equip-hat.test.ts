import { describe, it, expect } from 'vitest';
import { handler as equipHandler } from '../../src/handlers/equip-hat.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';
import { getStableHorse, applyRollResult } from '../../src/db/stable.js';

function equipEvent(user: TestUser, stable_horse_id: string, body: unknown): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /jockey/me/horses/{stable_horse_id}/equip',
    rawPath: `/jockey/me/horses/${stable_horse_id}/equip`,
    rawQueryString: '',
    pathParameters: { stable_horse_id },
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.4.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    body: JSON.stringify(body),
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

describe('equip-hat handler', () => {
  it('rejects when hat_index is out of range', async () => {
    const user = await makeUser('EquipUser_OOR');
    const horse = await makeHorse(user, 'NoHats');
    const res = await equipHandler(equipEvent(user, horse.stable_horse_id, { hat_index: 5 }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects when hat_index is the wrong type', async () => {
    const user = await makeUser('EquipUser_Bad');
    const horse = await makeHorse(user, 'Badtype');
    const res = await equipHandler(equipEvent(user, horse.stable_horse_id, { hat_index: 'not a number' }));
    expect(res.statusCode).toBe(400);
  });

  it('equips a valid index when the horse has a hat in inventory', async () => {
    const user = await makeUser('EquipUser_OK');
    const horse = await makeHorse(user, 'HatHaver');
    // Plant a hat directly via applyRollResult to avoid roll-RNG flakiness.
    await applyRollResult(user.user_id, horse.stable_horse_id, {
      expected_last_rolled_level: 0,
      append_hat: { id: 'flat_cap', variant: 0, obtained_at: new Date().toISOString() },
    });

    const res = await equipHandler(equipEvent(user, horse.stable_horse_id, { hat_index: 0 }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse((res as any).body);
    expect(body.equipped_hat).toBe(0);

    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.equipped_hat).toBe(0);
  });

  it('unequips when hat_index is null', async () => {
    const user = await makeUser('EquipUser_Null');
    const horse = await makeHorse(user, 'Naked');
    const res = await equipHandler(equipEvent(user, horse.stable_horse_id, { hat_index: null }));
    expect(res.statusCode).toBe(200);
    const after = await getStableHorse(user.user_id, horse.stable_horse_id);
    expect(after?.equipped_hat == null).toBe(true);
  });

  it('returns STABLE_HORSE_NOT_FOUND for unknown horse', async () => {
    const user = await makeUser('EquipUser_404');
    const res = await equipHandler(equipEvent(user, 'nonexistent', { hat_index: null }));
    expect(res.statusCode).toBe(404);
  });
});
