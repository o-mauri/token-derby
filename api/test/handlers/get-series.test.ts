import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as getSeriesHandler } from '../../src/handlers/get-series.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';

const COLORS = { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' };

function evt(
  body: unknown,
  routeKey: string,
  rawPath: string,
  pathParams?: Record<string, string>,
  user?: TestUser,
  bearer?: string,
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'x-cli-version': '2.6.0' };
  if (user) { headers['x-user-id'] = user.user_id; headers['x-user-token'] = user.secret_token; }
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return {
    version: '2.0', routeKey, rawPath, rawQueryString: '',
    pathParameters: pathParams, headers, requestContext: {} as any,
    body: body ? JSON.stringify(body) : undefined, isBase64Encoded: false,
  };
}

describe('getSeries handler', () => {
  beforeEach(() => { process.env.TOKEN_DERBY_MAX_RATE = '1000000000'; });
  afterEach(() => { delete process.env.TOKEN_DERBY_MAX_RATE; });

  async function setup() {
    const user = await makeUser('GS_User');
    const horse = await makeHorse(user, 'Bolt', COLORS);
    const created: any = await createHandler(evt({
      name: 'Series Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 3_600_000).toISOString(),
      tz: 'UTC',
    }, 'POST /races', '/races', undefined, user));
    if (created.statusCode !== 200) throw new Error(`createRace: ${created.body}`);
    const { join_code } = JSON.parse(created.body);
    const joined: any = await joinHandler(evt(
      { stable_horse_id: horse.stable_horse_id },
      'POST /races/{join_code}/join',
      `/races/${join_code}/join`,
      { join_code },
      user,
    ));
    if (joined.statusCode !== 200) throw new Error(`join: ${joined.body}`);
    const { horse_id, heartbeat_token } = JSON.parse(joined.body);
    const hb: any = await hbHandler(evt(
      { seq: 1, delta: 50 },
      'POST /races/{join_code}/horses/{horse_id}/heartbeat',
      `/races/${join_code}/horses/${horse_id}/heartbeat`,
      { join_code, horse_id },
      undefined,
      heartbeat_token,
    ));
    if (hb.statusCode !== 200) throw new Error(`heartbeat: ${hb.body}`);
    return { join_code, horse_id };
  }

  it('returns the window and per-horse points', async () => {
    const { join_code, horse_id } = await setup();
    const res: any = await getSeriesHandler(evt(undefined, 'GET /races/{join_code}/series', `/races/${join_code}/series`, { join_code }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(typeof body.start_ms).toBe('number');
    expect(typeof body.end_ms).toBe('number');
    const horse = body.horses.find((h: any) => h.horse_id === horse_id);
    expect(horse.points.length).toBeGreaterThanOrEqual(1);
    expect(horse.points[0].d).toBe(50);
  });

  it('returns empty points array for a horse with no heartbeats', async () => {
    const user1 = await makeUser('GS_EmptyUser1');
    const user2 = await makeUser('GS_EmptyUser2');
    const horse1 = await makeHorse(user1, 'ActiveHorse', COLORS);
    const horse2 = await makeHorse(user2, 'SilentHorse', COLORS);
    const created: any = await createHandler(evt({
      name: 'Empty Points Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 3_600_000).toISOString(),
      tz: 'UTC',
    }, 'POST /races', '/races', undefined, user1));
    if (created.statusCode !== 200) throw new Error(`createRace: ${created.body}`);
    const { join_code } = JSON.parse(created.body);

    // Join horse1 (user1) and send a heartbeat for it
    const joined1: any = await joinHandler(evt(
      { stable_horse_id: horse1.stable_horse_id },
      'POST /races/{join_code}/join',
      `/races/${join_code}/join`,
      { join_code },
      user1,
    ));
    if (joined1.statusCode !== 200) throw new Error(`join1: ${joined1.body}`);
    const { horse_id: horse_id1, heartbeat_token: hbt1 } = JSON.parse(joined1.body);
    const hb: any = await hbHandler(evt(
      { seq: 1, delta: 42 },
      'POST /races/{join_code}/horses/{horse_id}/heartbeat',
      `/races/${join_code}/horses/${horse_id1}/heartbeat`,
      { join_code, horse_id: horse_id1 },
      undefined,
      hbt1,
    ));
    if (hb.statusCode !== 200) throw new Error(`heartbeat: ${hb.body}`);

    // Join horse2 (user2) but send NO heartbeat for it
    const joined2: any = await joinHandler(evt(
      { stable_horse_id: horse2.stable_horse_id },
      'POST /races/{join_code}/join',
      `/races/${join_code}/join`,
      { join_code },
      user2,
    ));
    if (joined2.statusCode !== 200) throw new Error(`join2: ${joined2.body}`);
    const { horse_id: horse_id2 } = JSON.parse(joined2.body);

    const res: any = await getSeriesHandler(evt(undefined, 'GET /races/{join_code}/series', `/races/${join_code}/series`, { join_code }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const silentHorse = body.horses.find((h: any) => h.horse_id === horse_id2);
    expect(silentHorse).toBeDefined();
    expect(silentHorse.points).toEqual([]);
  });

  it('404s for an unknown race', async () => {
    const res: any = await getSeriesHandler(evt(undefined, 'GET /races/{join_code}/series', '/races/NOPE99/series', { join_code: 'NOPE99' }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('RACE_NOT_FOUND');
  });
});
