import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handler as getRaceHandler } from '../../src/handlers/get-race.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { putLeague } from '../../src/db/leagues.js';
import { ensureStanding } from '../../src/db/league-standings.js';
import { putRace } from '../../src/db/races.js';
import { addMember } from '../../src/db/organisations.js';
import { generateRaceId, generateJoinCode, generateAdminCode } from '../../src/lib/codes.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';

const COLORS = { body: '#fff', mane: '#000', tail: '#000', saddle: '#f00' };

function evt(
  body: unknown,
  path: string,
  routeKey: string,
  pathParams?: Record<string, string>,
  user?: TestUser,
  bearer?: string,
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = {
    'x-cli-version': CURRENT_CLI_VERSION,
  };
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  return {
    version: '2.0',
    routeKey, rawPath: path, rawQueryString: '',
    pathParameters: pathParams,
    headers,
    requestContext: {} as any,
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

describe('getRace handler', () => {
  beforeEach(() => { process.env.TOKEN_DERBY_MAX_RATE = '1000000000'; });
  afterEach(() => { delete process.env.TOKEN_DERBY_MAX_RATE; });
  async function setupRace(creator: TestUser, overrides: Record<string, any> = {}) {
    const createRes: any = await createHandler(evt({
      name: 'GetRace Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
      ...overrides,
    }, '/races', 'POST /races', undefined, creator));
    if (createRes.statusCode !== 200) throw new Error(`createRace: ${createRes.body}`);
    return JSON.parse(createRes.body);
  }

  async function joinH(join_code: string, user: TestUser, horseName: string) {
    const horse = await makeHorse(user, horseName, COLORS);
    const res: any = await joinHandler(evt(
      { stable_horse_id: horse.stable_horse_id },
      `/races/${join_code}/join`, 'POST /races/{join_code}/join', { join_code },
      user,
    ));
    if (res.statusCode !== 200) throw new Error(`join: ${res.body}`);
    return { ...JSON.parse(res.body), user };
  }

  async function hb(join_code: string, horse_id: string, tok: string, current_tokens: number) {
    await hbHandler(evt(
      { seq: 1, delta: current_tokens },
      `/races/${join_code}/horses/${horse_id}/heartbeat`,
      'POST /races/{join_code}/horses/{horse_id}/heartbeat',
      { join_code, horse_id }, undefined, tok,
    ));
  }

  it('returns 404 for unknown join code', async () => {
    const res: any = await getRaceHandler(evt(null, '/races/NOPE99', 'GET /races/{join_code}', { join_code: 'NOPE99' }));
    expect(res.statusCode).toBe(404);
  });

  it('GET /races/{join_code} is unauthenticated', async () => {
    const creator = await makeUser('GR_Creator1');
    const { join_code } = await setupRace(creator);
    // No identity headers at all.
    const res: any = await getRaceHandler({
      version: '2.0', routeKey: 'GET /races/{join_code}', rawPath: `/races/${join_code}`, rawQueryString: '',
      pathParameters: { join_code },
      headers: {},
      requestContext: {} as any, isBase64Encoded: false,
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns race with horses, ranked by current_tokens desc', async () => {
    const creator = await makeUser('GR_Creator2');
    const { join_code } = await setupRace(creator);
    const userA = await makeUser('GR_Alpha');
    const userB = await makeUser('GR_Beta');
    const userC = await makeUser('GR_Gamma');
    const a = await joinH(join_code, userA, 'Alpha');
    const b = await joinH(join_code, userB, 'Beta');
    const c = await joinH(join_code, userC, 'Gamma');
    await hb(join_code, a.horse_id, a.heartbeat_token, 100);
    await hb(join_code, b.horse_id, b.heartbeat_token, 500);
    await hb(join_code, c.horse_id, c.heartbeat_token, 300);

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.horses).toHaveLength(3);
    expect(body.horses.map((h: any) => [h.name, h.rank]).sort()).toEqual([['Alpha', 3], ['Beta', 1], ['Gamma', 2]]);
    expect(body.status).toBe('live');
    expect(typeof body.server_time).toBe('string');
    expect(typeof body.time_left_seconds).toBe('number');
    expect(body.horses.find((h: any) => h.name === 'Alpha').user_id).toBe(userA.user_id);
    expect(body.horses.find((h: any) => h.name === 'Alpha').user_name).toBe('GR_Alpha');
  });

  it('does not emit a `crashed` field even when last_heartbeat is stale', async () => {
    const creator = await makeUser('GR_Creator3');
    const { join_code, race_id } = await setupRace(creator);
    const userA = await makeUser('GR_StaleA');
    const a = await joinH(join_code, userA, 'StaleAlpha');
    await hb(join_code, a.horse_id, a.heartbeat_token, 100);

    const { updateHorseHeartbeat } = await import('../../src/db/horses.js');
    await updateHorseHeartbeat(race_id, a.horse_id, 100, new Date(Date.now() - 180_000).toISOString(), {
      live_xp: 0, last_rank: undefined,
      racer_streak_ms: 0, racer_awards: 0,
      pacesetter_streak_ms: 0, pacesetter_awards: 0,
      overtake_awards: 0, lead_take_awards: 0,
      last_stampede_at: undefined, was_in_last: false, comeback_awarded: false,
      last_gap_in_1st: undefined, last_pulled_away_at: undefined,
      recent_events: [],
    });

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    const body = JSON.parse(res.body);
    expect(body.horses[0].crashed).toBeUndefined();
  });

  it('echoes primary_top5 when the race was created with it', async () => {
    const creator = await makeUser('GR_Top5Creator');
    const { join_code } = await setupRace(creator, { primary_top5: true });

    const getRes: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    expect(getRes.statusCode).toBe(200);
    expect(JSON.parse(getRes.body).primary_top5).toBe(true);
  });

  it('exposes a trailing pace_15m for a live horse with recent tokens', async () => {
    const creator = await makeUser('GR_PaceCreator');
    // Start 5 min ago so the pace window is comfortably over the 1-min floor.
    const { join_code } = await setupRace(creator, {
      start_time: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    const userA = await makeUser('GR_PaceA');
    const a = await joinH(join_code, userA, 'PaceAlpha');
    await hb(join_code, a.horse_id, a.heartbeat_token, 600);

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    const body = JSON.parse(res.body);
    const horse = body.horses.find((h: any) => h.name === 'PaceAlpha');
    expect(typeof horse.pace_15m).toBe('number');
    expect(horse.pace_15m).toBeGreaterThan(0); // 600 tokens over a ~5-min window
  });

  it('omits pace_15m for a pending race', async () => {
    const creator = await makeUser('GR_PacePending');
    const { join_code } = await setupRace(creator, {
      start_time: new Date(Date.now() + 60_000).toISOString(),
    });
    const userA = await makeUser('GR_PacePendA');
    const a = await joinH(join_code, userA, 'PendPace');
    await hb(join_code, a.horse_id, a.heartbeat_token, 0);

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    const body = JSON.parse(res.body);
    expect(body.horses[0].pace_15m).toBeUndefined();
  });

  it('returns pending status when race start_time is in the future', async () => {
    const creator = await makeUser('GR_Creator4');
    const { join_code } = await setupRace(creator, {
      start_time: new Date(Date.now() + 60_000).toISOString(),
    });
    const userA = await makeUser('GR_PendingA');
    const a = await joinH(join_code, userA, 'PendAlpha');
    await hb(join_code, a.horse_id, a.heartbeat_token, 0);

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    const body = JSON.parse(res.body);
    expect(body.status).toBe('pending');
    expect(body.horses[0].crashed).toBeUndefined();
  });

  async function createOrg(user: TestUser, name: string): Promise<string> {
    const res: any = await createOrgHandler(evt({ name }, '/organisations', 'POST /organisations', undefined, user));
    if (res.statusCode !== 200) throw new Error(`create-org: ${res.body}`);
    return JSON.parse(res.body).org_id;
  }

  it('stamps league tags and per-horse division on a league race view', async () => {
    const owner = await makeUser('GR_LgOwner');
    const org_id = await createOrg(owner, 'GRLgOrg');
    await putLeague({
      org_id, divisions: 3, racers_per_division: 10, races_per_season: 8, promote_relegate_count: 1,
      weekdays: [1], start_local: '09:00', end_local: '17:00', tz: 'UTC',
      current_season: 1, status: 'active', created_at: 'c',
      creator_user_id: owner.user_id, creator_user_name: owner.display_name,
    });

    const join_code = generateJoinCode();
    await putRace({
      race_id: generateRaceId(),
      name: 'League Fixture',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
      max_participants: 20,
      join_code,
      created_at: new Date().toISOString(),
      org_id,
      organisation_name: 'GRLgOrg',
      league_id: org_id,
      league_season: 1,
      league_round: 1,
    }, generateAdminCode());

    const now = new Date().toISOString();

    // Horse with a season standing in division 2.
    const userA = await makeUser('GR_LgA');
    const horseA = await makeHorse(userA, 'LgHorseA');
    await addMember(org_id, userA.user_id, userA.display_name, now);
    const joinResA: any = await joinHandler(evt(
      { stable_horse_id: horseA.stable_horse_id }, `/races/${join_code}/join`, 'POST /races/{join_code}/join', { join_code }, userA,
    ));
    if (joinResA.statusCode !== 200) throw new Error(`join A: ${joinResA.body}`);
    await ensureStanding({
      org_id, season: 1, division: 2, stable_horse_id: horseA.stable_horse_id,
      horse_name: 'LgHorseA', user_id: userA.user_id, user_name: userA.display_name,
      points: 5, season_tokens: 100, entered_at: now,
    });

    // Horse with NO standing — should default to the bottom division (3).
    const userB = await makeUser('GR_LgB');
    const horseB = await makeHorse(userB, 'LgHorseB');
    await addMember(org_id, userB.user_id, userB.display_name, now);
    const joinResB: any = await joinHandler(evt(
      { stable_horse_id: horseB.stable_horse_id }, `/races/${join_code}/join`, 'POST /races/{join_code}/join', { join_code }, userB,
    ));
    if (joinResB.statusCode !== 200) throw new Error(`join B: ${joinResB.body}`);

    const res: any = await getRaceHandler(evt(null, `/races/${join_code}`, 'GET /races/{join_code}', { join_code }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.league_id).toBe(org_id);
    expect(body.league_season).toBe(1);
    expect(body.league_round).toBe(1);

    const hA = body.horses.find((h: any) => h.stable_horse_id === horseA.stable_horse_id);
    expect(hA.division).toBe(2);
    const hB = body.horses.find((h: any) => h.stable_horse_id === horseB.stable_horse_id);
    expect(hB.division).toBe(3);
  });
});
