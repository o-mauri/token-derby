import { describe, it, expect } from 'vitest';
import { handler } from '../../src/handlers/create-race.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getRaceByJoinCode, getRaceByAdminCode } from '../../src/db/races.js';

const TEST_USER_ID = '550e8400-e29b-41d4-a716-446655440000';
const TEST_USER_NAME = 'Alice';

type IdentityOpt = { userId?: string | null; userName?: string | null };

function event(
  body: unknown,
  cliVersion: string | null = '1.0.0',
  identity: IdentityOpt = {},
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  const uid = identity.userId === undefined ? TEST_USER_ID : identity.userId;
  const uname = identity.userName === undefined ? TEST_USER_NAME : identity.userName;
  if (uid !== null) headers['x-user-id'] = uid;
  if (uname !== null) headers['x-user-name'] = uname;
  return {
    version: '2.0',
    routeKey: 'POST /races',
    rawPath: '/races',
    rawQueryString: '',
    headers,
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

  it('rejects unparseable datetime strings', async () => {
    const res: any = await handler(event({
      name: 'Garbage',
      start_time: 'not-a-date',
      end_time: 'also-not-a-date',
      tz: 'UTC',
    }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('rejects non-string tz', async () => {
    const res: any = await handler(event({
      name: 'Bad tz',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 42,
    }));
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing X-Cli-Version header', async () => {
    const res: any = await handler(event({
      name: 'No version',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, null));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
    expect(JSON.parse(res.body).message).toMatch(/X-Cli-Version/i);
  });

  it('rejects malformed X-Cli-Version header', async () => {
    const res: any = await handler(event({
      name: 'Bad version',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, 'not-semver'));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('persists cli_version on the race', async () => {
    const res: any = await handler(event({
      name: 'Version test',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, '1.0.3'));
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.cli_version).toBe('1.0.3');
  });

  it('persists creator identity on the race', async () => {
    const res: any = await handler(event({
      name: 'Identity test',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }));
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.creator_user_id).toBe(TEST_USER_ID);
    expect(race?.creator_user_name).toBe(TEST_USER_NAME);
  });

  it('rejects missing identity headers with IDENTITY_REQUIRED', async () => {
    const res: any = await handler(event({
      name: 'No identity',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, '1.0.0', { userId: null, userName: null }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('IDENTITY_REQUIRED');
  });

  it('rejects malformed X-User-Id (not a UUID)', async () => {
    const res: any = await handler(event({
      name: 'Bad uid',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, '1.0.0', { userId: 'not-a-uuid' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('IDENTITY_REQUIRED');
    expect(JSON.parse(res.body).message).toMatch(/UUID/i);
  });

  it('rejects empty X-User-Name', async () => {
    const res: any = await handler(event({
      name: 'Empty name',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, '1.0.0', { userName: '' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('IDENTITY_REQUIRED');
  });

  it('rejects X-User-Name longer than 40 chars', async () => {
    const res: any = await handler(event({
      name: 'Long name',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, '1.0.0', { userName: 'x'.repeat(41) }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('IDENTITY_REQUIRED');
  });
});
