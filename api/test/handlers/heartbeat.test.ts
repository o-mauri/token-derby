import { describe, it, expect } from 'vitest';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listHorses } from '../../src/db/horses.js';

async function setup(cliVersion = '0.2.0') {
  const createRes: any = await createHandler({
    version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
    headers: { 'x-cli-version': cliVersion },
    requestContext: {} as any, isBase64Encoded: false,
    body: JSON.stringify({
      name: 'HB Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }),
  });
  const { join_code, race_id } = JSON.parse(createRes.body);
  const joinRes: any = await joinHandler({
    version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
    pathParameters: { join_code },
    headers: { 'x-cli-version': cliVersion },
    requestContext: {} as any, isBase64Encoded: false,
    body: JSON.stringify({ horse: { name: 'Gary', colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' } } }),
  });
  const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
  return { join_code, race_id, horse_id, heartbeat_token };
}

function hbEvent(
  join_code: string,
  horse_id: string,
  heartbeat_token: string | null,
  body: unknown,
  cliVersion: string | null = '0.2.0',
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (heartbeat_token) headers.authorization = `Bearer ${heartbeat_token}`;
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  return {
    version: '2.0',
    routeKey: 'POST /races/{join_code}/horses/{horse_id}/heartbeat',
    rawPath: `/races/${join_code}/horses/${horse_id}/heartbeat`,
    rawQueryString: '',
    pathParameters: { join_code, horse_id },
    headers,
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe('heartbeat handler', () => {
  it('updates current_tokens and last_heartbeat', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { current_tokens: 1234 }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.race_status).toBe('live');
    expect(typeof body.server_time).toBe('string');
    expect(typeof body.time_left_seconds).toBe('number');

    const horses = await listHorses(race_id);
    expect(horses[0]?.current_tokens).toBe(1234);
  });

  it('rejects wrong heartbeat token', async () => {
    const { join_code, horse_id } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, 'wrong-token', { current_tokens: 1 }));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('INVALID_TOKEN');
  });

  it('rejects missing authorization header', async () => {
    const { join_code, horse_id } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, null, { current_tokens: 1 }));
    expect(res.statusCode).toBe(401);
  });

  it('rejects negative current_tokens', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { current_tokens: -5 }));
    expect(res.statusCode).toBe(400);
  });

  it('returns RACE_NOT_FOUND for unknown code', async () => {
    const res: any = await hbHandler(hbEvent('NOPE99', 'no-horse', 'tok', { current_tokens: 0 }));
    expect(res.statusCode).toBe(404);
  });

  it('rejects heartbeat with mismatched minor version', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup('0.2.0');
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { current_tokens: 1 }, '0.3.0'));
    expect(res.statusCode).toBe(426);
    expect(JSON.parse(res.body).code).toBe('VERSION_MISMATCH');
  });

  it('accepts heartbeat with same minor but different patch', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup('0.2.0');
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { current_tokens: 1 }, '0.2.9'));
    expect(res.statusCode).toBe(200);
  });

  it('rejects heartbeat with missing version header', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup('0.2.0');
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { current_tokens: 1 }, null));
    expect(res.statusCode).toBe(426);
  });

  it('returns finished status without writing when race has ended', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    // Freeze the race's current_tokens at 777
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { current_tokens: 777 }));

    // Mark the race as ended
    const { setRaceEnded } = await import('../../src/db/races.js');
    await setRaceEnded(race_id, new Date().toISOString());

    // A subsequent heartbeat should NOT overwrite current_tokens
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { current_tokens: 9999 }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).race_status).toBe('finished');

    const { listHorses } = await import('../../src/db/horses.js');
    const horses = await listHorses(race_id);
    expect(horses[0]?.current_tokens).toBe(777);
  });
});
