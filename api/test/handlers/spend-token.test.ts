import { describe, it, expect } from 'vitest';
import { handler as spendHandler } from '../../src/handlers/spend-token.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as endHandler } from '../../src/handlers/end-race.js';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import { listHorses } from '../../src/db/horses.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

function evt(body: unknown, path: string, routeKey: string, pathParams?: Record<string, string>): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey, rawPath: path, rawQueryString: '',
    pathParameters: pathParams,
    headers: {},
    requestContext: {} as any,
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

async function setupWinner() {
  const cr: any = await createHandler(evt({
    name: 'Spend Test',
    start_time: new Date(Date.now() - 60_000).toISOString(),
    end_time: new Date(Date.now() + 3_600_000).toISOString(),
    tz: 'UTC',
  }, '/races', 'POST /races'));
  const { join_code, race_id, admin_code } = JSON.parse(cr.body);
  const jr: any = await joinHandler(evt(
    { horse: { name: 'Spender', colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' } } },
    `/races/${join_code}/join`, 'POST /races/{join_code}/join', { join_code },
  ));
  const { horse_id, heartbeat_token } = JSON.parse(jr.body);
  await hbHandler(evt({ current_tokens: 500 },
    `/races/${join_code}/horses/${horse_id}/heartbeat`,
    'POST /races/{join_code}/horses/{horse_id}/heartbeat',
    { join_code, horse_id }));
  await endHandler(evt(null, `/races/admin/${admin_code}`, 'DELETE /races/admin/{admin_code}', { admin_code }));
  return { join_code, race_id, horse_id, heartbeat_token };
}

describe('spendToken handler', () => {
  it('decrements loot_tokens and returns ok', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setupWinner();
    const res: any = await spendHandler(evt(
      { heartbeat_token },
      `/races/${join_code}/horses/${horse_id}/spend-token`,
      'POST /races/{join_code}/horses/{horse_id}/spend-token',
      { join_code, horse_id },
    ));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    const horses = await listHorses(race_id);
    expect(horses[0]?.loot_tokens).toBe(0);
  });

  it('returns INSUFFICIENT_TOKENS when no tokens available', async () => {
    const { join_code, horse_id, heartbeat_token } = await setupWinner();
    await spendHandler(evt({ heartbeat_token },
      `/races/${join_code}/horses/${horse_id}/spend-token`,
      'POST /races/{join_code}/horses/{horse_id}/spend-token',
      { join_code, horse_id }));
    const res: any = await spendHandler(evt({ heartbeat_token },
      `/races/${join_code}/horses/${horse_id}/spend-token`,
      'POST /races/{join_code}/horses/{horse_id}/spend-token',
      { join_code, horse_id }));
    expect(res.statusCode).toBe(402);
    expect(JSON.parse(res.body).code).toBe('INSUFFICIENT_TOKENS');
  });

  it('returns UNAUTHORIZED for wrong heartbeat_token', async () => {
    const { join_code, horse_id } = await setupWinner();
    const res: any = await spendHandler(evt(
      { heartbeat_token: 'wrong' },
      `/races/${join_code}/horses/${horse_id}/spend-token`,
      'POST /races/{join_code}/horses/{horse_id}/spend-token',
      { join_code, horse_id },
    ));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHORIZED');
  });
});
