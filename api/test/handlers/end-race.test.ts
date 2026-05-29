import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handler as endHandler } from '../../src/handlers/end-race.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listHorses } from '../../src/db/horses.js';
import { getRaceById } from '../../src/db/races.js';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';

const COLORS = { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' };

function evt(
  body: unknown,
  path: string,
  routeKey: string,
  pathParams?: Record<string, string>,
  user?: TestUser,
  bearer?: string,
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'x-cli-version': '2.4.0' };
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return {
    version: '2.0', routeKey, rawPath: path, rawQueryString: '',
    pathParameters: pathParams,
    headers,
    requestContext: {} as any,
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

describe('endRace handler', () => {
  beforeEach(() => { process.env.TOKEN_DERBY_MAX_RATE = '1000000000'; });
  afterEach(() => { delete process.env.TOKEN_DERBY_MAX_RATE; });

  it('ends the race and freezes final_tokens', async () => {
    const creator = await makeUser('End_Creator');
    const joiner = await makeUser('End_Joiner');
    const horse = await makeHorse(joiner, 'Gary', COLORS);
    const createRes: any = await createHandler(evt({
      name: 'End Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }, '/races', 'POST /races', undefined, creator));
    const { join_code, race_id, admin_code } = JSON.parse(createRes.body);

    const joinRes: any = await joinHandler(evt(
      { stable_horse_id: horse.stable_horse_id },
      `/races/${join_code}/join`, 'POST /races/{join_code}/join', { join_code },
      joiner,
    ));
    const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
    await hbHandler(evt({ seq: 1, delta: 777 },
      `/races/${join_code}/horses/${horse_id}/heartbeat`,
      'POST /races/{join_code}/horses/{horse_id}/heartbeat',
      { join_code, horse_id }, undefined, heartbeat_token,
    ));

    const res: any = await endHandler(evt(null, `/races/admin/${admin_code}`, 'DELETE /races/admin/{admin_code}', { admin_code }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });

    const race = await getRaceById(race_id);
    expect(race?.ended_at).toBeTruthy();
    const horses = await listHorses(race_id);
    expect(horses[0]?.final_tokens).toBe(777);
  });

  it('returns RACE_NOT_FOUND for unknown admin_code', async () => {
    const res: any = await endHandler(evt(null, '/races/admin/no-such', 'DELETE /races/admin/{admin_code}', { admin_code: 'no-such' }));
    expect(res.statusCode).toBe(404);
  });
});
