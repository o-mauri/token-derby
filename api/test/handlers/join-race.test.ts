import { describe, it, expect } from 'vitest';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listHorses } from '../../src/db/horses.js';
import { setRaceEnded } from '../../src/db/races.js';
import { getRaceByJoinCode } from '../../src/db/races.js';

async function createTestRace(overrides: Record<string, any> = {}, cliVersion = '0.2.0') {
  const res: any = await createHandler(createEvent({
    name: 'Join Test',
    start_time: new Date(Date.now() - 60_000).toISOString(),
    end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    tz: 'UTC',
    ...overrides,
  }, cliVersion));
  return JSON.parse(res.body);
}

function createEvent(body: unknown, cliVersion: string | null = '0.2.0'): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  return { version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '', headers, requestContext: {} as any, body: JSON.stringify(body), isBase64Encoded: false };
}

function joinEvent(join_code: string, body: unknown, cliVersion: string | null = '0.2.0'): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (cliVersion) headers['x-cli-version'] = cliVersion;
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

describe('joinRace handler', () => {
  it('joins a race and returns horse_id + heartbeat_token', async () => {
    const { join_code, race_id } = await createTestRace();
    const res: any = await joinHandler(joinEvent(join_code, validHorse));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.horse_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.heartbeat_token).toMatch(/^[0-9a-f-]{36}$/);

    const horses = await listHorses(race_id);
    expect(horses).toHaveLength(1);
    expect(horses[0]?.name).toBe('Gary');
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
    await joinHandler(joinEvent(join_code, validHorse));
    await joinHandler(joinEvent(join_code, validHorse));
    const res: any = await joinHandler(joinEvent(join_code, validHorse));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('RACE_FULL');
  });

  it('rejects missing horse fields', async () => {
    const { join_code } = await createTestRace();
    const res: any = await joinHandler(joinEvent(join_code, { horse: { name: 'x' } }));
    expect(res.statusCode).toBe(400);
  });

  it('accepts matching minor version (patch differs)', async () => {
    const { join_code } = await createTestRace({}, '0.2.0');
    const res: any = await joinHandler(joinEvent(join_code, validHorse, '0.2.7'));
    expect(res.statusCode).toBe(200);
  });

  it('rejects different minor version with VERSION_MISMATCH', async () => {
    const { join_code } = await createTestRace({}, '0.2.0');
    const res: any = await joinHandler(joinEvent(join_code, validHorse, '0.3.0'));
    expect(res.statusCode).toBe(426);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('VERSION_MISMATCH');
    expect(body.message).toMatch(/0\.2\.0/);
  });

  it('rejects different major version with VERSION_MISMATCH', async () => {
    const { join_code } = await createTestRace({}, '0.2.0');
    const res: any = await joinHandler(joinEvent(join_code, validHorse, '1.0.0'));
    expect(res.statusCode).toBe(426);
    expect(JSON.parse(res.body).code).toBe('VERSION_MISMATCH');
  });

  it('rejects missing version header on join when race is version-pinned', async () => {
    const { join_code } = await createTestRace({}, '0.2.0');
    const res: any = await joinHandler(joinEvent(join_code, validHorse, null));
    expect(res.statusCode).toBe(426);
    expect(JSON.parse(res.body).code).toBe('VERSION_MISMATCH');
  });

  it('accepts any version when race has no cli_version (legacy)', async () => {
    // Simulate a legacy race by writing directly without cli_version.
    const { putRace } = await import('../../src/db/races.js');
    const { generateRaceId, generateJoinCode, generateAdminCode } = await import('../../src/lib/codes.js');
    const legacyCode = generateJoinCode();
    await putRace({
      race_id: generateRaceId(),
      name: 'Legacy',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 3600_000).toISOString(),
      tz: 'UTC',
      max_participants: 30,
      join_code: legacyCode,
      created_at: new Date().toISOString(),
    } as any, generateAdminCode());

    const res: any = await joinHandler(joinEvent(legacyCode, validHorse, '99.99.99'));
    expect(res.statusCode).toBe(200);
  });
});
