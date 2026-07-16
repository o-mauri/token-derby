import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { listHorses } from '../../src/db/horses.js';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';
import type { ModelKey } from '@token-derby/shared';
import { CURRENT_CLI_VERSION, SAME_MINOR_CLI_VERSION, MISMATCHED_MINOR_CLI_VERSION, OUTDATED_CLI_VERSION } from '../helpers/cli-version.js';

const COLORS = { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' };

async function setup(cliVersion = CURRENT_CLI_VERSION) {
  const user = await makeUser('HB_User');
  const horse = await makeHorse(user, 'HB_Gary', COLORS);
  const createRes: any = await createHandler({
    version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': cliVersion, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
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
    headers: { 'content-type': 'application/json', 'x-cli-version': cliVersion, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, isBase64Encoded: false,
    body: JSON.stringify({ stable_horse_id: horse.stable_horse_id }),
  });
  const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
  return { join_code, race_id, horse_id, heartbeat_token };
}

/** Like setup() but locks a specific primary_model at join time. */
async function setupWithPrimary(primary_model: ModelKey | undefined, cliVersion = CURRENT_CLI_VERSION) {
  const user = await makeUser('HB_PM_User');
  const horse = await makeHorse(user, 'HB_PM_Gary', COLORS);
  const createRes: any = await createHandler({
    version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': cliVersion, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, isBase64Encoded: false,
    body: JSON.stringify({
      name: 'HB PM Test',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }),
  });
  const { join_code, race_id } = JSON.parse(createRes.body);
  const joinBody: Record<string, unknown> = { stable_horse_id: horse.stable_horse_id };
  if (primary_model !== undefined) joinBody.primary_model = primary_model;
  const joinRes: any = await joinHandler({
    version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
    pathParameters: { join_code },
    headers: { 'content-type': 'application/json', 'x-cli-version': cliVersion, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, isBase64Encoded: false,
    body: JSON.stringify(joinBody),
  });
  const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
  return { join_code, race_id, horse_id, heartbeat_token };
}

function hbEvent(
  join_code: string,
  horse_id: string,
  heartbeat_token: string | null,
  body: unknown,
  cliVersion: string | null = CURRENT_CLI_VERSION,
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
  beforeEach(() => { process.env.TOKEN_DERBY_MAX_RATE = '1000000000'; });
  afterEach(() => { delete process.env.TOKEN_DERBY_MAX_RATE; });

  it('accumulates applied deltas onto current_tokens and returns last_seq', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    const r1: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 1000 }));
    expect(r1.statusCode).toBe(200);
    expect(JSON.parse(r1.body).last_seq).toBe(1);
    await new Promise(r => setTimeout(r, 5));
    const r2: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 2, delta: 200 }));
    expect(JSON.parse(r2.body).last_seq).toBe(2);
    const horses = await listHorses(race_id);
    expect(horses[0]?.current_tokens).toBe(1200);
  });

  it('dedups a resent seq (no double-apply)', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 500 }));
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 500 })); // resend
    const horses = await listHorses(race_id);
    expect(horses[0]?.current_tokens).toBe(500);
  });

  it('writes a series point for an applied delta', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 750 }));
    const { listSeriesPoints } = await import('../../src/db/series.js');
    const pts = await listSeriesPoints(race_id, horse_id);
    expect(pts).toHaveLength(1);
    expect(pts[0]?.d).toBe(750);
  });

  it('rejects a negative delta or non-positive seq', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup();
    expect((await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: -5 }))).statusCode).toBe(400);
    expect((await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 0, delta: 5 }))).statusCode).toBe(400);
  });

  it('rejects wrong heartbeat token', async () => {
    const { join_code, horse_id } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, 'wrong-token', { seq: 1, delta: 1 }));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).code).toBe('INVALID_TOKEN');
  });

  it('rejects missing authorization header', async () => {
    const { join_code, horse_id } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, null, { seq: 1, delta: 1 }));
    expect(res.statusCode).toBe(401);
  });

  it('returns RACE_NOT_FOUND for unknown code', async () => {
    const res: any = await hbHandler(hbEvent('NOPE99', 'no-horse', 'tok', { seq: 1, delta: 0 }));
    expect(res.statusCode).toBe(404);
  });

  it('rejects heartbeat with mismatched minor version', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup(CURRENT_CLI_VERSION);
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 1 }, MISMATCHED_MINOR_CLI_VERSION));
    expect(res.statusCode).toBe(426);
    expect(JSON.parse(res.body).code).toBe('VERSION_MISMATCH');
  });

  it('accepts heartbeat with same minor but different patch', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup(CURRENT_CLI_VERSION);
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 1 }, SAME_MINOR_CLI_VERSION));
    expect(res.statusCode).toBe(200);
  });

  it('rejects heartbeat with missing version header', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup(CURRENT_CLI_VERSION);
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 1 }, null));
    expect(res.statusCode).toBe(426);
  });

  it('rejects heartbeat from a CLI version older than the API minimum', async () => {
    const { join_code, horse_id, heartbeat_token } = await setup();
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 1 }, OUTDATED_CLI_VERSION));
    expect(res.statusCode).toBe(426);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('VERSION_MISMATCH');
    expect(body.message).toContain(CURRENT_CLI_VERSION);
  });

  it('returns ranked horses in the response so the CLI can render the leaderboard', async () => {
    const creator = await makeUser('HB_Creator');
    const createRes: any = await createHandler({
      version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': creator.user_id, 'x-user-token': creator.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({
        name: 'HB Multi',
        start_time: new Date(Date.now() - 60_000).toISOString(),
        end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        tz: 'UTC',
      }),
    });
    const { join_code } = JSON.parse(createRes.body);

    const joinOne = async (user: TestUser, name: string) => {
      const h = await makeHorse(user, name, COLORS);
      const jr: any = await joinHandler({
        version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
        pathParameters: { join_code },
        headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
        requestContext: {} as any, isBase64Encoded: false,
        body: JSON.stringify({ stable_horse_id: h.stable_horse_id }),
      });
      return JSON.parse(jr.body) as { horse_id: string; heartbeat_token: string };
    };

    const a = await joinOne(await makeUser('HB_Alpha'), 'Alpha');
    const b = await joinOne(await makeUser('HB_Beta'), 'Beta');
    const c = await joinOne(await makeUser('HB_Gamma'), 'Gamma');

    await hbHandler(hbEvent(join_code, a.horse_id, a.heartbeat_token, { seq: 1, delta: 100 }));
    await hbHandler(hbEvent(join_code, b.horse_id, b.heartbeat_token, { seq: 1, delta: 500 }));
    const res: any = await hbHandler(hbEvent(join_code, c.horse_id, c.heartbeat_token, { seq: 1, delta: 300 }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.horses).toHaveLength(3);
    const byName = (n: string) => body.horses.find((h: any) => h.name === n);
    expect(byName('Beta').rank).toBe(1);
    expect(byName('Gamma').rank).toBe(2);
    expect(byName('Alpha').rank).toBe(3);
    expect(byName('Gamma').current_tokens).toBe(300);
    expect(body.race.name).toBe('HB Multi');
    expect(typeof body.race.start_time).toBe('string');
    expect(typeof body.race.end_time).toBe('string');
  });

  it('finalises a stale-live race when no one has called getRace yet', async () => {
    const user = await makeUser('HB_FinaliseUser');
    const horse = await makeHorse(user, 'HB_FinaliseGary', COLORS);
    const createRes: any = await createHandler({
      version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({
        name: 'HB Finalise',
        start_time: new Date(Date.now() - 60_000).toISOString(),
        end_time: new Date(Date.now() + 250).toISOString(),
        tz: 'UTC',
      }),
    });
    const { join_code, race_id } = JSON.parse(createRes.body);
    const joinRes: any = await joinHandler({
      version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
      pathParameters: { join_code },
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({ stable_horse_id: horse.stable_horse_id }),
    });
    const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 4242 }));

    await new Promise(r => setTimeout(r, 400));

    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 2, delta: 9999 }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.race_status).toBe('finished');

    const { getRaceByJoinCode } = await import('../../src/db/races.js');
    const race = await getRaceByJoinCode(join_code);
    expect(race?.ended_at).toBeTruthy();

    const horses = await listHorses(race_id);
    expect(horses[0]?.final_tokens).toBe(4242);
  });

  it('returns finished status without writing when race has ended', async () => {
    const { join_code, race_id, horse_id, heartbeat_token } = await setup();
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 777 }));

    const { setRaceEnded } = await import('../../src/db/races.js');
    await setRaceEnded(race_id, new Date().toISOString());

    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 2, delta: 9999 }));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).race_status).toBe('finished');

    const horses = await listHorses(race_id);
    expect(horses[0]?.current_tokens).toBe(777);
  });

  it('accrues live_xp and recent_events across multiple heartbeats', async () => {
    // Use a race that started well before the warm-up window (>8% of total duration ago).
    const user = await makeUser('XP_User');
    const horse = await makeHorse(user, 'XP_Gary', COLORS);
    // Start 1 hour ago, end 1 hour from now — warm-up is 8% of 2h = ~9.6 min, well past it.
    const createRes: any = await createHandler({
      version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({
        name: 'XP Test',
        start_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        tz: 'UTC',
      }),
    });
    const { join_code } = JSON.parse(createRes.body);
    const joinRes: any = await joinHandler({
      version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
      pathParameters: { join_code },
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({ stable_horse_id: horse.stable_horse_id }),
    });
    const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
    // First heartbeat — initializes state.
    await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1, delta: 100 }));
    await new Promise(r => setTimeout(r, 5));
    // Second heartbeat with a big token jump should trigger Stampede! (delta >= 7000).
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 2, delta: 9900 }));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    const own = body.horses.find((h: any) => h.horse_id === horse_id);
    expect(own.live_xp).toBe(2);
    expect(own.recent_events?.some((e: any) => e.name === 'Stampede!')).toBe(true);
  });

  it('rejects heartbeat when the version header is missing, even for a race without cli_version', async () => {
    const { putRace } = await import('../../src/db/races.js');
    const { putHorse } = await import('../../src/db/horses.js');
    const user = await makeUser('NoVer_User');
    const horse = await makeHorse(user, 'NoVer_Gary', COLORS);
    const race_id = `r-${Math.random().toString(36).slice(2)}`;
    const join_code = `NV${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await putRace({
      race_id, name: 'NoVer', join_code,
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 3_600_000).toISOString(),
      tz: 'UTC', max_participants: 10, created_at: new Date().toISOString(),
      // intentionally no cli_version
    } as any, `admin-${Math.random().toString(36).slice(2)}`);
    await putHorse(race_id, {
      horse_id: 'h-nv', stable_horse_id: horse.stable_horse_id, name: 'NoVer_Gary',
      colors: COLORS, current_tokens: 0, last_heartbeat: new Date().toISOString(),
      joined_at: new Date().toISOString(), user_id: user.user_id, user_name: 'NoVer_User', xp: 0,
    } as any, 'tok');

    const res: any = await hbHandler(hbEvent(join_code, 'h-nv', 'tok', { seq: 1, delta: 0 }, null));
    expect(res.statusCode).toBe(426);
    expect(JSON.parse(res.body).code).toBe('VERSION_MISMATCH');
  });

  // --- multi-model weighting ---

  it('weights components by the horse primary before the rate cap', async () => {
    // Join with primary_model='codex'; rate cap disabled via TOKEN_DERBY_MAX_RATE=1B
    const { join_code, race_id, horse_id, heartbeat_token } = await setupWithPrimary('codex');
    // raw weighted = codex:5000*1 + claude:1000*0.5 + gemini:0*0.5 = 5500
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, {
      seq: 1,
      components: { claude: 1000, codex: 5000, gemini: 0 },
    }));
    expect(res.statusCode).toBe(200);
    const horses = await listHorses(race_id);
    const own = horses.find(h => h.horse_id === horse_id);
    expect(own?.current_tokens).toBe(5500);
  });

  it('accepts a legacy bare delta (primary defaults to claude for legacy horses)', async () => {
    // Join without primary_model; server defaults to 'claude'
    const { join_code, race_id, horse_id, heartbeat_token } = await setupWithPrimary(undefined);
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, {
      seq: 1,
      delta: 250,
    }));
    expect(res.statusCode).toBe(200);
    const horses = await listHorses(race_id);
    const own = horses.find(h => h.horse_id === horse_id);
    expect(own?.current_tokens).toBe(250);
  });

  it('rejects a heartbeat with neither components nor a delta', async () => {
    const { join_code, horse_id, heartbeat_token } = await setupWithPrimary('claude');
    const res: any = await hbHandler(hbEvent(join_code, horse_id, heartbeat_token, { seq: 1 }));
    expect(res.statusCode).toBe(400);
  });

  it('does not accrue XP during the warm-up window', async () => {
    // Set up a race with start_time = now (so warm-up just began).
    const user = await makeUser('WU_User');
    const horse = await makeHorse(user, 'WU_Gary', COLORS);
    const startIso = new Date().toISOString();
    const endIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const createRes: any = await createHandler({
      version: '2.0', routeKey: 'POST /races', rawPath: '/races', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({ name: 'WU Test', start_time: startIso, end_time: endIso, tz: 'UTC' }),
    });
    const { join_code } = JSON.parse(createRes.body);
    const joinRes: any = await joinHandler({
      version: '2.0', routeKey: 'POST /races/{join_code}/join', rawPath: `/races/${join_code}/join`, rawQueryString: '',
      pathParameters: { join_code },
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
      requestContext: {} as any, isBase64Encoded: false,
      body: JSON.stringify({ stable_horse_id: horse.stable_horse_id }),
    });
    const { horse_id: hid, heartbeat_token: hbt } = JSON.parse(joinRes.body);
    // Big token jump that would normally trigger Stampede!
    await hbHandler(hbEvent(join_code, hid, hbt, { seq: 1, delta: 100 }));
    await new Promise(r => setTimeout(r, 5));
    const res: any = await hbHandler(hbEvent(join_code, hid, hbt, { seq: 2, delta: 9900 }));
    const body = JSON.parse(res.body);
    const own = body.horses.find((h: any) => h.horse_id === hid);
    expect(own.live_xp ?? 0).toBe(0);
    expect(own.recent_events ?? []).toEqual([]);
  });
});
