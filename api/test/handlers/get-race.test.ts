import { describe, it, expect } from 'vitest';
import { handler as getRaceHandler } from '../../src/handlers/get-race.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const DEFAULT_USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function evt(
  body: unknown,
  path: string,
  routeKey: string,
  pathParams?: Record<string, string>,
  auth?: string,
  userId: string = DEFAULT_USER_ID,
  userName: string = 'GetRace Tester',
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {
    'x-cli-version': '1.0.0',
    'x-user-id': userId,
    'x-user-name': userName,
  };
  if (auth) headers.authorization = `Bearer ${auth}`;
  return {
    version: '2.0',
    routeKey, rawPath: path, rawQueryString: '',
    pathParameters: pathParams,
    headers,
    requestContext: {} as any,
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

describe('getRace handler', () => {
  async function setupRace() {
    const createRes: any = await createHandler(evt({
      name: 'GetRace Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }, '/races', 'POST /races'));
    return JSON.parse(createRes.body);
  }

  async function joinH(join_code: string, name: string, userId: string) {
    const res: any = await joinHandler(evt(
      { horse: { name, colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' } } },
      `/races/${join_code}/join`, 'POST /races/{join_code}/join', { join_code },
      undefined, userId, `User ${name}`,
    ));
    return JSON.parse(res.body);
  }

  async function hb(join_code: string, horse_id: string, tok: string, current_tokens: number, userId: string) {
    await hbHandler(evt(
      { current_tokens },
      `/races/${join_code}/horses/${horse_id}/heartbeat`,
      'POST /races/{join_code}/horses/{horse_id}/heartbeat',
      { join_code, horse_id }, tok, userId,
    ));
  }

  it('returns 404 for unknown join code', async () => {
    const res: any = await getRaceHandler(evt(null, '/races/NOPE99', 'GET /races/{join_code}', { join_code: 'NOPE99' }));
    expect(res.statusCode).toBe(404);
  });

  it('returns race with horses, ranked by current_tokens desc', async () => {
    const { join_code } = await setupRace();
    const userA = 'b0000000-0000-0000-0000-00000000000a';
    const userB = 'b0000000-0000-0000-0000-00000000000b';
    const userC = 'b0000000-0000-0000-0000-00000000000c';
    const a = await joinH(join_code, 'Alpha', userA);
    const b = await joinH(join_code, 'Beta', userB);
    const c = await joinH(join_code, 'Gamma', userC);
    await hb(join_code, a.horse_id, a.heartbeat_token, 100, userA);
    await hb(join_code, b.horse_id, b.heartbeat_token, 500, userB);
    await hb(join_code, c.horse_id, c.heartbeat_token, 300, userC);

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.horses).toHaveLength(3);
    expect(body.horses.map((h: any) => [h.name, h.rank]).sort()).toEqual([['Alpha', 3], ['Beta', 1], ['Gamma', 2]]);
    expect(body.status).toBe('live');
    expect(typeof body.server_time).toBe('string');
    expect(typeof body.time_left_seconds).toBe('number');
    // user_id / user_name should be on the view
    expect(body.horses.find((h: any) => h.name === 'Alpha').user_id).toBe(userA);
    expect(body.horses.find((h: any) => h.name === 'Alpha').user_name).toBe('User Alpha');
  });

  it('does not emit a `crashed` field even when last_heartbeat is stale', async () => {
    const { join_code, race_id } = await setupRace();
    const userA = 'b0000000-0000-0000-0000-00000000aaaa';
    const a = await joinH(join_code, 'Alpha', userA);
    await hb(join_code, a.horse_id, a.heartbeat_token, 100, userA);

    const { updateHorseTokens } = await import('../../src/db/horses.js');
    await updateHorseTokens(race_id, a.horse_id, 100, new Date(Date.now() - 180_000).toISOString());

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    const body = JSON.parse(res.body);
    expect(body.horses[0].crashed).toBeUndefined();
  });

  it('returns pending status with no crashed concept', async () => {
    const createRes: any = await createHandler(evt({
      name: 'Future race',
      start_time: new Date(Date.now() + 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }, '/races', 'POST /races'));
    const { join_code } = JSON.parse(createRes.body);
    const userA = 'b0000000-0000-0000-0000-00000000bbbb';
    const a = await joinH(join_code, 'Alpha', userA);
    await hb(join_code, a.horse_id, a.heartbeat_token, 0, userA);

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    const body = JSON.parse(res.body);
    expect(body.status).toBe('pending');
    expect(body.horses[0].crashed).toBeUndefined();
  });
});
