import { describe, it, expect } from 'vitest';
import { handler as endHandler } from '../../src/handlers/end-race.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listHorses } from '../../src/db/horses.js';
import { getRaceById } from '../../src/db/races.js';

function evt(body: unknown, path: string, routeKey: string, pathParams?: Record<string, string>, auth?: string): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {
    'x-cli-version': '1.0.0',
    'x-user-id': '99999999-9999-9999-9999-999999999999',
    'x-user-name': 'End Tester',
  };
  if (auth) headers.authorization = `Bearer ${auth}`;
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
  it('ends the race and freezes final_tokens', async () => {
    const createRes: any = await createHandler(evt({
      name: 'End Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }, '/races', 'POST /races'));
    const { join_code, race_id, admin_code } = JSON.parse(createRes.body);

    const joinRes: any = await joinHandler(evt(
      { horse: { name: 'Gary', colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' } } },
      `/races/${join_code}/join`, 'POST /races/{join_code}/join', { join_code },
    ));
    const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
    await hbHandler(evt({ current_tokens: 777 },
      `/races/${join_code}/horses/${horse_id}/heartbeat`,
      'POST /races/{join_code}/horses/{horse_id}/heartbeat',
      { join_code, horse_id }, heartbeat_token,
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
