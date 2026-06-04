import { describe, it, expect } from 'vitest';
import { handler as listOrgRaces } from '../../src/handlers/list-org-races.js';
import { handler as createOrg } from '../../src/handlers/create-organisation.js';
import { handler as createRace } from '../../src/handlers/create-race.js';
import { handler as joinRace } from '../../src/handlers/join-race.js';
import { handler as equipHat } from '../../src/handlers/equip-hat.js';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { setRaceEnded } from '../../src/db/races.js';
import { setHorseFinalTokens } from '../../src/db/horses.js';
import { applyRollResult } from '../../src/db/stable.js';
import { handler as joinOrg } from '../../src/handlers/join-organisation.js';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';
import { ddb, TABLE } from '../../src/db/client.js';
import { horseKey } from '../../src/db/keys.js';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

const HCOLORS = { body: '#abc', mane: '#111', tail: '#222', saddle: '#333' };

// Join `user`'s newly-created stable horse into a race, returning the
// race-horse record (incl. horse_id + heartbeat_token).
async function joinHorse(join_code: string, user: TestUser, horseName: string, equipHatFirst = false) {
  const stable = await makeHorse(user, horseName, HCOLORS);
  if (equipHatFirst) {
    await applyRollResult(user.user_id, stable.stable_horse_id, {
      expected_last_rolled_level: 0,
      append_hat: { id: 'flat_cap', variant: 0, obtained_at: new Date().toISOString() },
    });
    const eqRes: any = await equipHat({
      version: '2.0',
      routeKey: 'POST /jockey/me/horses/{stable_horse_id}/equip',
      rawPath: `/jockey/me/horses/${stable.stable_horse_id}/equip`,
      rawQueryString: '',
      pathParameters: { stable_horse_id: stable.stable_horse_id },
      headers: {
        'content-type': 'application/json',
        'x-cli-version': '2.6.0',
        'x-user-id': user.user_id,
        'x-user-token': user.secret_token,
      },
      body: JSON.stringify({ hat_index: 0 }),
      requestContext: {} as any,
      isBase64Encoded: false,
    });
    if (eqRes.statusCode !== 200) throw new Error(`equip: ${eqRes.body}`);
  }
  const res: any = await joinRace({
    version: '2.0',
    routeKey: 'POST /races/{join_code}/join',
    rawPath: `/races/${join_code}/join`,
    rawQueryString: '',
    pathParameters: { join_code },
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.6.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    body: JSON.stringify({ stable_horse_id: stable.stable_horse_id }),
    requestContext: {} as any,
    isBase64Encoded: false,
  });
  if (res.statusCode !== 200) throw new Error(`join: ${res.body}`);
  return JSON.parse(res.body);
}

// Create a fresh user and make them a member of the org via its join token.
async function makeMember(name: string, join_token: string): Promise<TestUser> {
  const user = await makeUser(name);
  const res: any = await joinOrg({
    version: '2.0',
    routeKey: 'POST /organisations/join',
    rawPath: '/organisations/join',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.6.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    body: JSON.stringify({ join_token }),
    requestContext: {} as any,
    isBase64Encoded: false,
  });
  if (res.statusCode !== 200) throw new Error(`joinOrg: ${res.body}`);
  return user;
}

// Directly set current_tokens (and optionally joined_at) on a race horse,
// avoiding rate-cap / achievement plumbing in the heartbeat path.
async function setHorseTokens(race_id: string, horse_id: string, current_tokens: number, joined_at?: string) {
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: horseKey(race_id, horse_id),
    UpdateExpression: joined_at
      ? 'SET current_tokens = :t, joined_at = :j'
      : 'SET current_tokens = :t',
    ExpressionAttributeValues: joined_at ? { ':t': current_tokens, ':j': joined_at } : { ':t': current_tokens },
  }));
}

function createOrgEvent(name: string, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /organisations',
    rawPath: '/organisations',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.6.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify({ name }),
    isBase64Encoded: false,
  };
}

function createRaceEvent(body: any, user: TestUser): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'POST /races',
    rawPath: '/races',
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
      'x-cli-version': '2.6.0',
      'x-user-id': user.user_id,
      'x-user-token': user.secret_token,
    },
    requestContext: {} as any,
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };
}

function listEvent(org_name: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /organisations/{org_name}/races',
    rawPath: `/organisations/${org_name}/races`,
    rawQueryString: '',
    pathParameters: { org_name },
    headers: {},
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

describe('listOrgRaces handler', () => {
  it('returns races for an org with computed statuses (live, pending, finished)', async () => {
    const user = await makeUser('LOR_Alice');
    await createOrg(createOrgEvent('LorOrgA', user));

    // Live race: started in the past, hasn't ended yet
    const liveRes: any = await createRace(createRaceEvent({
      name: 'Live one',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorOrgA',
    }, user));
    const liveJoin = JSON.parse(liveRes.body).join_code;

    // Pending race: starts far in the future
    const pendingRes: any = await createRace(createRaceEvent({
      name: 'Pending one',
      start_time: '2099-06-01T00:00:00Z',
      end_time: '2099-06-02T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorOrgA',
    }, user));
    const pendingJoin = JSON.parse(pendingRes.body).join_code;

    // Finished race: explicitly ended. Window predates the live race —
    // create-race rejects org races whose windows overlap an existing one.
    const finishedRes: any = await createRace(createRaceEvent({
      name: 'Finished one',
      start_time: '2019-02-01T00:00:00Z',
      end_time: '2019-02-02T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorOrgA',
    }, user));
    const finishedBody = JSON.parse(finishedRes.body);
    await setRaceEnded(finishedBody.race_id, '2019-02-01T01:00:00Z');

    const res: any = await listOrgRaces(listEvent('LorOrgA'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.org_name).toBe('LorOrgA');
    expect(body.races).toHaveLength(3);

    const byCode = new Map<string, any>(body.races.map((r: any) => [r.join_code, r]));
    expect(byCode.get(liveJoin).status).toBe('live');
    expect(byCode.get(pendingJoin).status).toBe('pending');
    const finishedSummary = byCode.get(finishedBody.join_code);
    expect(finishedSummary.status).toBe('finished');
    expect(finishedSummary.ended_at).toBe('2019-02-01T01:00:00Z');
  });

  it('does not require auth (public endpoint)', async () => {
    const user = await makeUser('LOR_Pub');
    await createOrg(createOrgEvent('LorPub', user));
    await createRace(createRaceEvent({
      name: 'Public listing',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorPub',
    }, user));

    const res: any = await listOrgRaces(listEvent('LorPub'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).races).toHaveLength(1);
  });

  it('returns an empty list for an org with no races', async () => {
    const user = await makeUser('LOR_Empty');
    await createOrg(createOrgEvent('LorEmpty', user));
    const res: any = await listOrgRaces(listEvent('LorEmpty'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).races).toEqual([]);
  });

  it('returns ORG_NOT_FOUND for unknown org', async () => {
    const res: any = await listOrgRaces(listEvent('NoSuchOrg'));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).code).toBe('ORG_NOT_FOUND');
  });

  it('rejects malformed org names with BAD_REQUEST', async () => {
    const res: any = await listOrgRaces(listEvent('bad name'));
    expect(res.statusCode).toBe(400);
  });

  it('omits races that do not belong to the org', async () => {
    const user = await makeUser('LOR_Isolated');
    await createOrg(createOrgEvent('LorIso', user));
    await createRace(createRaceEvent({
      name: 'In org',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorIso',
    }, user));
    await createRace(createRaceEvent({
      name: 'Out of org',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
    }, user));

    const res: any = await listOrgRaces(listEvent('LorIso'));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.races).toHaveLength(1);
    expect(body.races[0].name).toBe('In org');
  });

  it('finished race: highlight is the horse with highest final_tokens', async () => {
    const owner = await makeUser('LOR_FinOwner');
    const orgRes: any = await createOrg(createOrgEvent('LorFin', owner));
    const { org_join_token } = JSON.parse(orgRes.body);

    const raceRes: any = await createRace(createRaceEvent({
      name: 'Finished with winner',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorFin',
    }, owner));
    const { race_id, join_code } = JSON.parse(raceRes.body);

    const loser = owner; // owner is already a member
    const winnerUser = await makeMember('LOR_FinWinner', org_join_token);

    const loserHorse = await joinHorse(join_code, loser, 'Loser');
    const winnerHorse = await joinHorse(join_code, winnerUser, 'Winner');
    await setHorseFinalTokens(race_id, loserHorse.horse_id, 100);
    await setHorseFinalTokens(race_id, winnerHorse.horse_id, 500);
    // current_tokens drives ranking; final_tokens equals frozen current_tokens.
    await setHorseTokens(race_id, loserHorse.horse_id, 100);
    await setHorseTokens(race_id, winnerHorse.horse_id, 500);

    await setRaceEnded(race_id, '2020-01-01T01:00:00Z');

    const res: any = await listOrgRaces(listEvent('LorFin'));
    const summary = JSON.parse(res.body).races[0];
    expect(summary.status).toBe('finished');
    expect(summary.highlight.horse_name).toBe('Winner');
    expect(summary.highlight.tokens).toBe(500);
    expect(summary.highlight.colors).toEqual(HCOLORS);
    expect(summary.time_left_seconds).toBeUndefined();
  });

  it('finished-but-never-finalized race: highlight tokens fall back to current_tokens', async () => {
    const owner = await makeUser('LOR_NoFinal');
    await createOrg(createOrgEvent('LorNoFinal', owner));

    const raceRes: any = await createRace(createRaceEvent({
      name: 'Never finalized',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorNoFinal',
    }, owner));
    const { race_id, join_code } = JSON.parse(raceRes.body);

    const horse = await joinHorse(join_code, owner, 'Soloist');
    await setHorseTokens(race_id, horse.horse_id, 250); // no final_tokens set
    await setRaceEnded(race_id, '2020-01-01T01:00:00Z');

    const res: any = await listOrgRaces(listEvent('LorNoFinal'));
    const summary = JSON.parse(res.body).races[0];
    expect(summary.status).toBe('finished');
    expect(summary.highlight.horse_name).toBe('Soloist');
    expect(summary.highlight.tokens).toBe(250);
  });

  it('live race: highlight is current leader and time_left_seconds is plausible', async () => {
    const owner = await makeUser('LOR_LiveOwner');
    const orgRes: any = await createOrg(createOrgEvent('LorLive', owner));
    const { org_join_token } = JSON.parse(orgRes.body);

    // 1 hour race that started in the past and ends in the future.
    const start = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const raceRes: any = await createRace(createRaceEvent({
      name: 'Live leader',
      start_time: start,
      end_time: end,
      tz: 'UTC',
      organisation_name: 'LorLive',
    }, owner));
    const { race_id, join_code } = JSON.parse(raceRes.body);

    const trailing = owner;
    const leaderUser = await makeMember('LOR_LiveLeader', org_join_token);
    const trailingHorse = await joinHorse(join_code, trailing, 'Trailing');
    const leaderHorse = await joinHorse(join_code, leaderUser, 'Leading');
    await setHorseTokens(race_id, trailingHorse.horse_id, 200);
    await setHorseTokens(race_id, leaderHorse.horse_id, 900);

    const res: any = await listOrgRaces(listEvent('LorLive'));
    const summary = JSON.parse(res.body).races[0];
    expect(summary.status).toBe('live');
    expect(summary.highlight.horse_name).toBe('Leading');
    expect(summary.highlight.tokens).toBe(900);
    expect(summary.time_left_seconds).toBeGreaterThan(0);
    expect(summary.time_left_seconds).toBeLessThanOrEqual(60 * 60);
  });

  it('tiebreak: equal tokens, earlier joined_at wins', async () => {
    const owner = await makeUser('LOR_TieOwner');
    const orgRes: any = await createOrg(createOrgEvent('LorTie', owner));
    const { org_join_token } = JSON.parse(orgRes.body);

    const raceRes: any = await createRace(createRaceEvent({
      name: 'Tie race',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorTie',
    }, owner));
    const { race_id, join_code } = JSON.parse(raceRes.body);

    const earlyUser = owner;
    const lateUser = await makeMember('LOR_TieLate', org_join_token);
    const earlyHorse = await joinHorse(join_code, earlyUser, 'EarlyBird');
    const lateHorse = await joinHorse(join_code, lateUser, 'LateComer');
    // Equal tokens; explicit joined_at ordering.
    await setHorseTokens(race_id, earlyHorse.horse_id, 300, '2020-01-01T00:00:01Z');
    await setHorseTokens(race_id, lateHorse.horse_id, 300, '2020-01-01T00:00:02Z');

    const res: any = await listOrgRaces(listEvent('LorTie'));
    const summary = JSON.parse(res.body).races[0];
    expect(summary.highlight.horse_name).toBe('EarlyBird');
    expect(summary.highlight.tokens).toBe(300);
  });

  it('race with zero horses: no highlight', async () => {
    const owner = await makeUser('LOR_ZeroOwner');
    await createOrg(createOrgEvent('LorZero', owner));
    await createRace(createRaceEvent({
      name: 'Empty live',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorZero',
    }, owner));

    const res: any = await listOrgRaces(listEvent('LorZero'));
    const summary = JSON.parse(res.body).races[0];
    expect(summary.status).toBe('live');
    expect(summary.highlight).toBeUndefined();
    expect(summary.time_left_seconds).toBeGreaterThan(0);
  });

  it('pending race: no highlight and no time_left_seconds', async () => {
    const owner = await makeUser('LOR_PendOwner');
    await createOrg(createOrgEvent('LorPend', owner));
    await createRace(createRaceEvent({
      name: 'Future race',
      start_time: '2099-06-01T00:00:00Z',
      end_time: '2099-06-02T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorPend',
    }, owner));

    const res: any = await listOrgRaces(listEvent('LorPend'));
    const summary = JSON.parse(res.body).races[0];
    expect(summary.status).toBe('pending');
    expect(summary.highlight).toBeUndefined();
    expect(summary.time_left_seconds).toBeUndefined();
  });

  it('highlight includes colors and hat when the leader has an equipped hat', async () => {
    const owner = await makeUser('LOR_HatOwner');
    await createOrg(createOrgEvent('LorHat', owner));
    const raceRes: any = await createRace(createRaceEvent({
      name: 'Hatted leader',
      start_time: '2020-01-01T00:00:00Z',
      end_time: '2099-01-01T00:00:00Z',
      tz: 'UTC',
      organisation_name: 'LorHat',
    }, owner));
    const { race_id, join_code } = JSON.parse(raceRes.body);

    const horse = await joinHorse(join_code, owner, 'Fancy', /* equipHatFirst */ true);
    await setHorseTokens(race_id, horse.horse_id, 400);

    const res: any = await listOrgRaces(listEvent('LorHat'));
    const summary = JSON.parse(res.body).races[0];
    expect(summary.highlight.horse_name).toBe('Fancy');
    expect(summary.highlight.colors).toEqual(HCOLORS);
    expect(summary.highlight.hat).toMatchObject({ id: 'flat_cap', variant: 0 });
  });
});
