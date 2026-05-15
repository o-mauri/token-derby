import { describe, it, expect } from 'vitest';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { handler as joinOrgHandler } from '../../src/handlers/join-organisation.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listHorses } from '../../src/db/horses.js';
import { setRaceEnded } from '../../src/db/races.js';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';

const COLORS = { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' };

function authedEvent(
  user: TestUser | null,
  method: string,
  path: string,
  body?: unknown,
  pathParameters?: Record<string, string>,
  cliVersion: string | null = '2.0.0',
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {};
  if (cliVersion) headers['x-cli-version'] = cliVersion;
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  if (body !== undefined) headers['content-type'] = 'application/json';
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    pathParameters,
    headers,
    requestContext: {} as any,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

async function createTestRace(creator: TestUser, overrides: Record<string, any> = {}, cliVersion = '2.0.0') {
  const res: any = await createHandler(authedEvent(creator, 'POST', '/races', {
    name: 'Join Test',
    start_time: new Date(Date.now() - 60_000).toISOString(),
    end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    tz: 'UTC',
    ...overrides,
  }, undefined, cliVersion));
  if (res.statusCode !== 200) throw new Error(`createRace failed: ${res.body}`);
  return JSON.parse(res.body);
}

function joinEvent(joinCode: string, user: TestUser | null, body: unknown, cliVersion: string | null = '2.0.0') {
  return authedEvent(user, 'POST', `/races/${joinCode}/join`, body, { join_code: joinCode }, cliVersion);
}

describe('joinRace handler', () => {
  it('joins a race using a stable_horse_id and snapshots the horse', async () => {
    const creator = await makeUser('JR_Creator1');
    const joiner = await makeUser('JR_Joiner1');
    const horse = await makeHorse(joiner, 'Gary', COLORS);
    const { join_code, race_id } = await createTestRace(creator);

    const res: any = await joinHandler(joinEvent(join_code, joiner, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.horse_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.heartbeat_token).toMatch(/^[0-9a-f-]{36}$/);

    const horses = await listHorses(race_id);
    expect(horses).toHaveLength(1);
    expect(horses[0]?.name).toBe('Gary');
    expect(horses[0]?.user_id).toBe(joiner.user_id);
    expect(horses[0]?.user_name).toBe('JR_Joiner1');
    expect(horses[0]?.stable_horse_id).toBe(horse.stable_horse_id);
    expect(horses[0]?.colors).toEqual(COLORS);
  });

  it('returns STABLE_HORSE_NOT_FOUND for unknown stable_horse_id', async () => {
    const creator = await makeUser('JR_C2');
    const joiner = await makeUser('JR_J2');
    const { join_code } = await createTestRace(creator);
    const res: any = await joinHandler(joinEvent(join_code, joiner, { stable_horse_id: 'nonexistent' }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('STABLE_HORSE_NOT_FOUND');
  });

  it('refuses to use another user\'s stable_horse_id', async () => {
    const creator = await makeUser('JR_C3');
    const alice = await makeUser('JR_Alice3');
    const bob = await makeUser('JR_Bob3');
    const aliceHorse = await makeHorse(alice, 'Stealer', COLORS);
    const { join_code } = await createTestRace(creator);
    // Bob tries to join with Alice's horse id (server scopes lookups to authed user).
    const res: any = await joinHandler(joinEvent(join_code, bob, { stable_horse_id: aliceHorse.stable_horse_id }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('STABLE_HORSE_NOT_FOUND');
  });

  it('returns RACE_NOT_FOUND for unknown code', async () => {
    const joiner = await makeUser('JR_NoRace');
    const horse = await makeHorse(joiner, 'Gary', COLORS);
    const res: any = await joinHandler(joinEvent('NOPE99', joiner, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('RACE_NOT_FOUND');
  });

  it('returns RACE_FINISHED when ended', async () => {
    const creator = await makeUser('JR_CEnded');
    const joiner = await makeUser('JR_JEnded');
    const horse = await makeHorse(joiner, 'Gary', COLORS);
    const { join_code, race_id } = await createTestRace(creator);
    await setRaceEnded(race_id, new Date().toISOString());
    const res: any = await joinHandler(joinEvent(join_code, joiner, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(410);
  });

  it('returns RACE_FULL when at capacity', async () => {
    const creator = await makeUser('JR_CFull');
    const { join_code } = await createTestRace(creator, { max_participants: 2 });
    for (let i = 0; i < 2; i++) {
      const u = await makeUser(`JR_FullJ${i}`);
      const h = await makeHorse(u, `H${i}`, COLORS);
      const r: any = await joinHandler(joinEvent(join_code, u, { stable_horse_id: h.stable_horse_id }));
      expect(r.statusCode).toBe(200);
    }
    const u3 = await makeUser('JR_FullJ2');
    const h3 = await makeHorse(u3, 'H2', COLORS);
    const res: any = await joinHandler(joinEvent(join_code, u3, { stable_horse_id: h3.stable_horse_id }));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('RACE_FULL');
  });

  it('returns UNAUTHENTICATED when no token is sent', async () => {
    const creator = await makeUser('JR_NoAuth');
    const { join_code } = await createTestRace(creator);
    const res: any = await joinHandler(joinEvent(join_code, null, { stable_horse_id: 'whatever' }));
    expect(res.statusCode).toBe(401);
  });

  it('resumes when the same user joins again with the same horse — mints a fresh token', async () => {
    const creator = await makeUser('JR_CResume');
    const joiner = await makeUser('JR_JResume');
    const horse = await makeHorse(joiner, 'Gary', COLORS);
    const { join_code, race_id } = await createTestRace(creator);
    const first: any = await joinHandler(joinEvent(join_code, joiner, { stable_horse_id: horse.stable_horse_id }));
    const second: any = await joinHandler(joinEvent(join_code, joiner, { stable_horse_id: horse.stable_horse_id }));

    expect(second.statusCode).toBe(200);
    const firstBody = JSON.parse(first.body);
    const secondBody = JSON.parse(second.body);
    expect(secondBody.horse_id).toBe(firstBody.horse_id);
    expect(secondBody.heartbeat_token).not.toBe(firstBody.heartbeat_token);

    const horses = await listHorses(race_id);
    expect(horses).toHaveLength(1);
  });

  it('returns DUPLICATE_HORSE when same user joins again with a different stable horse', async () => {
    const creator = await makeUser('JR_CDup');
    const joiner = await makeUser('JR_JDup');
    const horseA = await makeHorse(joiner, 'A_Gary', COLORS);
    const horseB = await makeHorse(joiner, 'B_Beth', COLORS);
    const { join_code } = await createTestRace(creator);
    await joinHandler(joinEvent(join_code, joiner, { stable_horse_id: horseA.stable_horse_id }));
    const res: any = await joinHandler(joinEvent(join_code, joiner, { stable_horse_id: horseB.stable_horse_id }));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('DUPLICATE_HORSE');
    expect(JSON.parse(res.body).message).toMatch(/A_Gary/);
  });

  it('blocks non-members of an org-restricted race with NOT_ORG_MEMBER', async () => {
    const creator = await makeUser('JR_OrgCreator');
    const outsider = await makeUser('JR_Outsider');
    const horse = await makeHorse(outsider, 'OutsiderH', COLORS);
    const orgRes: any = await createOrgHandler(authedEvent(creator, 'POST', '/organisations', { name: 'JoinOrg1' }));
    expect(orgRes.statusCode).toBe(200);
    const createRes: any = await createHandler(authedEvent(creator, 'POST', '/races', {
      name: 'Org-only race',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
      organisation_name: 'JoinOrg1',
    }));
    expect(createRes.statusCode).toBe(200);
    const { join_code } = JSON.parse(createRes.body);

    const res: any = await joinHandler(joinEvent(join_code, outsider, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('NOT_ORG_MEMBER');
    expect(body.message).toMatch(/JoinOrg1/);
  });

  it('lets members of an org join an org-restricted race', async () => {
    const creator = await makeUser('JR_OrgC2');
    const member = await makeUser('JR_Member');
    const horse = await makeHorse(member, 'MemberH', COLORS);
    const orgRes: any = await createOrgHandler(authedEvent(creator, 'POST', '/organisations', { name: 'JoinOrg2' }));
    const { org_join_token } = JSON.parse(orgRes.body);

    const joinOrgRes: any = await joinOrgHandler(authedEvent(member, 'POST', '/organisations/join', { join_token: org_join_token }));
    expect(joinOrgRes.statusCode).toBe(200);

    const createRes: any = await createHandler(authedEvent(creator, 'POST', '/races', {
      name: 'Org race ok',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
      organisation_name: 'JoinOrg2',
    }));
    const { join_code } = JSON.parse(createRes.body);

    const res: any = await joinHandler(joinEvent(join_code, member, { stable_horse_id: horse.stable_horse_id }));
    expect(res.statusCode).toBe(200);
  });
});
