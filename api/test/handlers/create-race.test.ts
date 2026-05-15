import { describe, it, expect } from 'vitest';
import { handler } from '../../src/handlers/create-race.js';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getRaceByJoinCode, getRaceByAdminCode } from '../../src/db/races.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';

function event(
  body: unknown,
  user: TestUser | null,
  cliVersion: string | null = '2.0.0',
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
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

function orgEvent(body: unknown, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /organisations',
    rawPath: '/organisations',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.0.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

describe('createRace handler', () => {
  it('creates a race and returns join + admin codes', async () => {
    const user = await makeUser('CR_Alice');
    const res: any = await handler(event({
      name: 'Test Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'Europe/London',
    }, user));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.race_id).toBeTruthy();
    expect(body.join_code).toMatch(/^[A-Z0-9]{6}$/);
    expect(body.admin_code).toMatch(/^[0-9a-f-]{36}$/);

    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.name).toBe('Test Derby');
    expect(race?.max_participants).toBe(30);
    expect(race?.creator_user_name).toBe('CR_Alice');

    const raceByAdmin = await getRaceByAdminCode(body.admin_code);
    expect(raceByAdmin?.race_id).toBe(body.race_id);
  });

  it('uses server-stored display_name, ignoring any client-sent name', async () => {
    const user = await makeUser('CR_Server');
    const ev = event({
      name: 'Identity test',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, user);
    // Even if a malicious client tries to send an x-user-name, the server ignores it.
    (ev.headers as Record<string, string>)['x-user-name'] = 'Forged';
    const res: any = await handler(ev);
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.creator_user_name).toBe('CR_Server');
  });

  it('respects custom max_participants', async () => {
    const user = await makeUser('CR_Max');
    const res: any = await handler(event({
      name: 'Small Derby',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      max_participants: 5,
    }, user));
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.max_participants).toBe(5);
  });

  it('rejects missing fields with BAD_REQUEST', async () => {
    const user = await makeUser('CR_BadReq');
    const res: any = await handler(event({ name: 'No times' }, user));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('BAD_REQUEST');
  });

  it('rejects end_time before start_time', async () => {
    const user = await makeUser('CR_Bwd');
    const res: any = await handler(event({
      name: 'Backwards',
      start_time: '2026-04-22T17:00:00Z',
      end_time: '2026-04-22T09:00:00Z',
      tz: 'UTC',
    }, user));
    expect(res.statusCode).toBe(400);
  });

  it('rejects unparseable datetime strings', async () => {
    const user = await makeUser('CR_Garbage');
    const res: any = await handler(event({
      name: 'Garbage',
      start_time: 'not-a-date',
      end_time: 'also-not-a-date',
      tz: 'UTC',
    }, user));
    expect(res.statusCode).toBe(400);
  });

  it('rejects missing X-Cli-Version header', async () => {
    const user = await makeUser('CR_NoVer');
    const res: any = await handler(event({
      name: 'No version',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, user, null));
    expect(res.statusCode).toBe(400);
  });

  it('rejects auth-missing requests with UNAUTHENTICATED', async () => {
    const res: any = await handler(event({
      name: 'No auth',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, null));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('UNAUTHENTICATED');
  });

  it('rejects unknown user with UNAUTHENTICATED', async () => {
    const fakeUser: TestUser = {
      user_id: '11111111-1111-1111-1111-111111111111',
      display_name: 'Ghost',
      secret_token: 'fake-token',
    };
    const res: any = await handler(event({
      name: 'Ghost race',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, fakeUser));
    expect(res.statusCode).toBe(401);
  });

  it('rejects wrong token with UNAUTHENTICATED', async () => {
    const user = await makeUser('CR_Wrong');
    const ev = event({
      name: 'Wrong token',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, user);
    (ev.headers as Record<string, string>)['x-user-token'] = 'wrong-token';
    const res: any = await handler(ev);
    expect(res.statusCode).toBe(401);
  });

  it('persists cli_version on the race', async () => {
    const user = await makeUser('CR_VerPersist');
    const res: any = await handler(event({
      name: 'Version test',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, user, '2.0.3'));
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.cli_version).toBe('2.0.3');
  });

  it('rejects CLI versions older than 2.0.0 with VERSION_MISMATCH', async () => {
    const user = await makeUser('CR_OldCli');
    const res: any = await handler(event({
      name: 'Old client',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
    }, user, '1.5.0'));
    expect(res.statusCode).toBe(426);
    expect(JSON.parse(res.body).code).toBe('VERSION_MISMATCH');
  });

  it('links a race to an org when caller is a member', async () => {
    const user = await makeUser('CR_OrgOk');
    const orgRes: any = await createOrgHandler(orgEvent({ name: 'CrtRaceA' }, user));
    expect(orgRes.statusCode).toBe(200);
    const res: any = await handler(event({
      name: 'Org Race',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      organisation_name: 'CrtRaceA',
    }, user));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const race = await getRaceByJoinCode(body.join_code);
    expect(race?.org_id).toBe(JSON.parse(orgRes.body).org_id);
    expect(race?.organisation_name).toBe('CrtRaceA');
  });

  it('returns ORG_NOT_FOUND for unknown organisation', async () => {
    const user = await makeUser('CR_OrgMiss');
    const res: any = await handler(event({
      name: 'Unknown org',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      organisation_name: 'NoSuch',
    }, user));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });

  it('returns NOT_ORG_MEMBER when creator is not a member', async () => {
    const owner = await makeUser('CR_OrgOwner');
    const other = await makeUser('CR_OrgOther');
    await createOrgHandler(orgEvent({ name: 'CrtRaceB' }, owner));
    const res: any = await handler(event({
      name: 'Not member',
      start_time: '2026-04-22T09:00:00Z',
      end_time: '2026-04-22T17:00:00Z',
      tz: 'UTC',
      organisation_name: 'CrtRaceB',
    }, other));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('NOT_ORG_MEMBER');
  });
});
