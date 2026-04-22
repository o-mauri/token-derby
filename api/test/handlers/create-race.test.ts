import { describe, it, expect } from 'vitest';
import { handler } from '../../src/handlers/create-race.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getRaceByJoinCode, getRaceByAdminCode } from '../../src/db/races.js';

function event(body: unknown): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /races',
    rawPath: '/races',
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe('createRace handler', () => {
  it('creates a race and returns join + admin codes', async () => {
    const res: any = await handler(event({
      name: 'Test Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'Europe/London',
    }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.race_id).toBeTruthy();
    expect(body.join_code).toMatch(/^[A-Z0-9]{6}$/);
    expect(body.admin_code).toMatch(/^[0-9a-f-]{36}$/);

    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.name).toBe('Test Derby');
    expect(race?.max_participants).toBe(30);

    const raceByAdmin = await getRaceByAdminCode(body.admin_code);
    expect(raceByAdmin?.race_id).toBe(body.race_id);
  });

  it('respects custom max_participants', async () => {
    const res: any = await handler(event({
      name: 'Small Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      max_participants: 5,
    }));
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.max_participants).toBe(5);
  });

  it('rejects missing fields with BAD_REQUEST', async () => {
    const res: any = await handler(event({ name: 'No times' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('rejects end_time before start_time', async () => {
    const res: any = await handler(event({
      name: 'Backwards',
      start_time: '2026-04-22T17:00:00Z',
      end_time: '2026-04-22T09:00:00Z',
      tz: 'UTC',
    }));
    expect(res.statusCode).toBe(400);
  });
});
