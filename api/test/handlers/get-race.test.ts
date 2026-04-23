import { describe, it, expect } from 'vitest';
import { handler as getRaceHandler } from '../../src/handlers/get-race.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

function evt(body: unknown, path: string, routeKey: string, pathParams?: Record<string, string>, auth?: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey, rawPath: path, rawQueryString: '',
    pathParameters: pathParams,
    headers: auth ? { authorization: `Bearer ${auth}` } : {},
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

  async function joinH(join_code: string, name: string) {
    const res: any = await joinHandler(evt(
      { horse: { name, colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' } } },
      `/races/${join_code}/join`, 'POST /races/{join_code}/join', { join_code },
    ));
    return JSON.parse(res.body);
  }

  async function hb(join_code: string, horse_id: string, tok: string, current_tokens: number) {
    await hbHandler(evt({ current_tokens }, `/races/${join_code}/horses/${horse_id}/heartbeat`, 'POST /races/{join_code}/horses/{horse_id}/heartbeat', { join_code, horse_id }, tok));
  }

  it('returns 404 for unknown join code', async () => {
    const res: any = await getRaceHandler(evt(null, '/races/NOPE99', 'GET /races/{join_code}', { join_code: 'NOPE99' }));
    expect(res.statusCode).toBe(404);
  });

  it('returns race with horses, ranked by current_tokens desc', async () => {
    const { join_code } = await setupRace();
    const a = await joinH(join_code, 'Alpha');
    const b = await joinH(join_code, 'Beta');
    const c = await joinH(join_code, 'Gamma');
    await hb(join_code, a.horse_id, a.heartbeat_token, 100);
    await hb(join_code, b.horse_id, b.heartbeat_token, 500);
    await hb(join_code, c.horse_id, c.heartbeat_token, 300);

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.horses).toHaveLength(3);
    expect(body.horses.map((h: any) => [h.name, h.rank]).sort()).toEqual([['Alpha', 3], ['Beta', 1], ['Gamma', 2]]);
    expect(body.status).toBe('live');
    expect(typeof body.server_time).toBe('string');
    expect(typeof body.time_left_seconds).toBe('number');
  });

  it('marks horse as crashed when last_heartbeat > 120s ago', async () => {
    const { join_code, race_id } = await setupRace();
    const a = await joinH(join_code, 'Alpha');
    await hb(join_code, a.horse_id, a.heartbeat_token, 100);

    const { updateHorseTokens } = await import('../../src/db/horses.js');
    await updateHorseTokens(race_id, a.horse_id, 100, new Date(Date.now() - 180_000).toISOString());

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    const body = JSON.parse(res.body);
    expect(body.horses[0].crashed).toBe(true);
  });

  it('does not mark crashed during pending', async () => {
    const createRes: any = await createHandler(evt({
      name: 'Future race',
      start_time: new Date(Date.now() + 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }, '/races', 'POST /races'));
    const { join_code } = JSON.parse(createRes.body);
    const a = await joinH(join_code, 'Alpha');
    await hb(join_code, a.horse_id, a.heartbeat_token, 0);

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    const body = JSON.parse(res.body);
    expect(body.status).toBe('pending');
    expect(body.horses[0].crashed).toBe(false);
  });
});
