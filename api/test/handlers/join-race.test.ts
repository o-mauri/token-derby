import { describe, it, expect } from 'vitest';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listHorses } from '../../src/db/horses.js';
import { setRaceEnded } from '../../src/db/races.js';

const CREATOR_USER_ID = '11111111-1111-1111-1111-111111111111';
const CREATOR_USER_NAME = 'Creator';
const JOINER_USER_ID = '22222222-2222-2222-2222-222222222222';
const JOINER_USER_NAME = 'Joiner';

type IdentityOpt = { userId?: string | null; userName?: string | null };

async function createTestRace(overrides: Record<string, any> = {}, cliVersion = '1.0.0') {
  const res: any = await createHandler(createEvent({
    name: 'Join Test',
    start_time: new Date(Date.now() - 60_000).toISOString(),
    end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    tz: 'UTC',
    ...overrides,
  }, cliVersion));
  return JSON.parse(res.body);
}

function createEvent(body: unknown, cliVersion: string | null = '1.0.0'): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  headers['x-user-id'] = CREATOR_USER_ID;
  headers['x-user-name'] = CREATOR_USER_NAME;
  return { version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '', headers, requestContext: {} as any, body: JSON.stringify(body), isBase64Encoded: false };
}

function joinEvent(
  join_code: string,
  body: unknown,
  cliVersion: string | null = '1.0.0',
  identity: IdentityOpt = {},
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  const uid = identity.userId === undefined ? JOINER_USER_ID : identity.userId;
  const uname = identity.userName === undefined ? JOINER_USER_NAME : identity.userName;
  if (uid !== null) headers['x-user-id'] = uid;
  if (uname !== null) headers['x-user-name'] = uname;
  return {
    version: '2.0',
    routeKey: 'POST /races/{join_code}/join',
    rawPath: `/races/${join_code}/join`,
    rawQueryString: '',
    pathParameters: { join_code },
    headers,
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

const validHorse = {
  horse: {
    name: 'Gary',
    colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
  },
};

const otherHorse = {
  horse: {
    name: 'Beth',
    colors: { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' },
  },
};

describe('joinRace handler', () => {
  it('joins a race and returns horse_id + heartbeat_token, persists identity', async () => {
    const { join_code, race_id } = await createTestRace();
    const res: any = await joinHandler(joinEvent(join_code, validHorse));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.horse_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.heartbeat_token).toMatch(/^[0-9a-f-]{36}$/);

    const horses = await listHorses(race_id);
    expect(horses).toHaveLength(1);
    expect(horses[0]?.name).toBe('Gary');
    expect(horses[0]?.user_id).toBe(JOINER_USER_ID);
    expect(horses[0]?.user_name).toBe(JOINER_USER_NAME);
  });

  it('returns RACE_NOT_FOUND for unknown code', async () => {
    const res: any = await joinHandler(joinEvent('NOPE99', validHorse));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('RACE_NOT_FOUND');
  });

  it('returns RACE_FINISHED when ended', async () => {
    const { join_code, race_id } = await createTestRace();
    await setRaceEnded(race_id, new Date().toISOString());
    const res: any = await joinHandler(joinEvent(join_code, validHorse));
    expect(res.statusCode).toBe(410);
    expect(JSON.parse(res.body).code).toBe('RACE_FINISHED');
  });

  it('returns RACE_FULL when at capacity', async () => {
    const { join_code } = await createTestRace({ max_participants: 2 });
    // Two different users join.
    await joinHandler(joinEvent(join_code, validHorse, '1.0.0', { userId: '33333333-3333-3333-3333-333333333333' }));
    await joinHandler(joinEvent(join_code, otherHorse, '1.0.0', { userId: '44444444-4444-4444-4444-444444444444' }));
    // Third (different) user should fail.
    const res: any = await joinHandler(joinEvent(join_code, validHorse, '1.0.0', { userId: '55555555-5555-5555-5555-555555555555' }));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('RACE_FULL');
  });

  it('rejects missing horse fields', async () => {
    const { join_code } = await createTestRace();
    const res: any = await joinHandler(joinEvent(join_code, { horse: { name: 'x' } }));
    expect(res.statusCode).toBe(400);
  });

  it('accepts matching minor version (patch differs)', async () => {
    const { join_code } = await createTestRace({}, '1.0.0');
    const res: any = await joinHandler(joinEvent(join_code, validHorse, '1.0.7'));
    expect(res.statusCode).toBe(200);
  });

  it('rejects different minor version with VERSION_MISMATCH', async () => {
    const { join_code } = await createTestRace({}, '1.0.0');
    const res: any = await joinHandler(joinEvent(join_code, validHorse, '1.1.0'));
    expect(res.statusCode).toBe(426);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('VERSION_MISMATCH');
    expect(body.message).toMatch(/1\.0\.0/);
  });

  it('rejects different major version with VERSION_MISMATCH', async () => {
    const { join_code } = await createTestRace({}, '1.0.0');
    const res: any = await joinHandler(joinEvent(join_code, validHorse, '2.0.0'));
    expect(res.statusCode).toBe(426);
    expect(JSON.parse(res.body).code).toBe('VERSION_MISMATCH');
  });

  it('rejects missing version header on join when race is version-pinned', async () => {
    const { join_code } = await createTestRace({}, '1.0.0');
    const res: any = await joinHandler(joinEvent(join_code, validHorse, null));
    expect(res.statusCode).toBe(426);
    expect(JSON.parse(res.body).code).toBe('VERSION_MISMATCH');
  });

  it('rejects missing identity headers with IDENTITY_REQUIRED', async () => {
    const { join_code } = await createTestRace();
    const res: any = await joinHandler(joinEvent(join_code, validHorse, '1.0.0', { userId: null, userName: null }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('IDENTITY_REQUIRED');
  });

  it('resumes when the same user joins again with the same horse — mints fresh heartbeat_token', async () => {
    const { join_code, race_id } = await createTestRace();
    const first: any = await joinHandler(joinEvent(join_code, validHorse));
    const second: any = await joinHandler(joinEvent(join_code, validHorse));

    expect(second.statusCode).toBe(200);
    const firstBody = JSON.parse(first.body);
    const secondBody = JSON.parse(second.body);
    expect(secondBody.horse_id).toBe(firstBody.horse_id); // same horse
    expect(secondBody.heartbeat_token).not.toBe(firstBody.heartbeat_token); // new token

    // Only one horse for this user.
    const horses = await listHorses(race_id);
    expect(horses).toHaveLength(1);
  });

  it('returns DUPLICATE_HORSE when same user joins again with a different horse', async () => {
    const { join_code } = await createTestRace();
    await joinHandler(joinEvent(join_code, validHorse));
    const res: any = await joinHandler(joinEvent(join_code, otherHorse));
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('DUPLICATE_HORSE');
    expect(body.message).toMatch(/Gary/);
  });

  it('rejects join from a CLI version older than the API minimum', async () => {
    const { join_code } = await createTestRace();
    const res: any = await joinHandler(joinEvent(join_code, validHorse, '0.2.0'));
    expect(res.statusCode).toBe(426);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('VERSION_MISMATCH');
    expect(body.message).toMatch(/1\.0\.0/);
  });

  it('two different users can both join with horses named the same — they are separate horses', async () => {
    const { join_code, race_id } = await createTestRace();
    const userA = '66666666-6666-6666-6666-666666666666';
    const userB = '77777777-7777-7777-7777-777777777777';
    const a: any = await joinHandler(joinEvent(join_code, validHorse, '1.0.0', { userId: userA }));
    const b: any = await joinHandler(joinEvent(join_code, validHorse, '1.0.0', { userId: userB }));
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    const horses = await listHorses(race_id);
    expect(horses).toHaveLength(2);
    expect(JSON.parse(a.body).horse_id).not.toBe(JSON.parse(b.body).horse_id);
  });
});
