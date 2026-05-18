import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createHandler } from '../../src/handlers/create-race.js';
import { handler as joinHandler } from '../../src/handlers/join-race.js';
import { handler as hbHandler } from '../../src/handlers/heartbeat.js';
import { handler as endHandler } from '../../src/handlers/end-race.js';
import { handler as listStable } from '../../src/handlers/list-stable.js';
import { listHorses } from '../../src/db/horses.js';
import { finaliseRace } from '../../src/lib/finalise-race.js';
import { getRaceById } from '../../src/db/races.js';
import { makeUser, makeHorse, type TestUser } from '../helpers/auth-helper.js';

const COLORS = { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' };

function authedEvent(
  user: TestUser | null,
  method: string,
  path: string,
  body?: unknown,
  pathParameters?: Record<string, string>,
  bearer?: string,
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'x-cli-version': '2.0.0' };
  if (user) {
    headers['x-user-id'] = user.user_id;
    headers['x-user-token'] = user.secret_token;
  }
  if (bearer) headers.authorization = `Bearer ${bearer}`;
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

async function setupRaceWithRanks(): Promise<{
  creator: TestUser;
  joiners: TestUser[];
  horses: Array<{ user: TestUser; stable_horse_id: string; horse_id: string; heartbeat_token: string }>;
  race_id: string;
  join_code: string;
  admin_code: string;
}> {
  const creator = await makeUser('XP_Creator');
  const createRes: any = await createHandler(authedEvent(creator, 'POST', '/races', {
    name: 'XP Test',
    start_time: new Date(Date.now() - 60_000).toISOString(),
    end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    tz: 'UTC',
  }));
  const { race_id, join_code, admin_code } = JSON.parse(createRes.body);

  const joiners: TestUser[] = [];
  const horses: Array<{ user: TestUser; stable_horse_id: string; horse_id: string; heartbeat_token: string }> = [];
  // Four joiners — Winner / 2nd / 3rd / 4th (tokens decreasing).
  const tokensByPlace = [1000, 800, 500, 100];
  for (let i = 0; i < tokensByPlace.length; i++) {
    const u = await makeUser(`XP_J${i + 1}`);
    joiners.push(u);
    const h = await makeHorse(u, `H${i + 1}`, COLORS);
    const joinRes: any = await joinHandler(authedEvent(u, 'POST', `/races/${join_code}/join`,
      { stable_horse_id: h.stable_horse_id }, { join_code }));
    const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
    await hbHandler(authedEvent(null, 'POST',
      `/races/${join_code}/horses/${horse_id}/heartbeat`,
      { current_tokens: tokensByPlace[i]! },
      { join_code, horse_id }, heartbeat_token,
    ));
    horses.push({ user: u, stable_horse_id: h.stable_horse_id, horse_id, heartbeat_token });
  }
  return { creator, joiners, horses, race_id, join_code, admin_code };
}

async function getStableXp(user: TestUser): Promise<number> {
  const res: any = await listStable(authedEvent(user, 'GET', '/jockey/me/horses'));
  const horses = JSON.parse(res.body).horses;
  return horses[0]?.xp ?? 0;
}

describe('XP awarding on race end', () => {
  // tokensByPlace = [1000, 800, 500, 100], winner = 1000
  // Position XP + token bonus:
  //   Rank 1: 80 + 15 (flat winner)        = 95
  //   Rank 2: 65 + round(800/1000 * 15)=12 = 77
  //   Rank 3: 50 + round(500/1000 * 15)=8  = 58
  //   Rank 4: 25 + round(100/1000 * 15)=2  = 27
  it('awards position XP + token bonus to ranks 1/2/3/4', async () => {
    const { admin_code, horses } = await setupRaceWithRanks();

    const res: any = await endHandler(authedEvent(null, 'DELETE', `/races/admin/${admin_code}`,
      undefined, { admin_code }));
    expect(res.statusCode).toBe(200);

    expect(await getStableXp(horses[0]!.user)).toBe(95); // winner
    expect(await getStableXp(horses[1]!.user)).toBe(77); // runner-up
    expect(await getStableXp(horses[2]!.user)).toBe(58); // podium
    expect(await getStableXp(horses[3]!.user)).toBe(27); // also-ran
  });

  it('stamps xp_awarded on each race horse', async () => {
    const { admin_code, race_id } = await setupRaceWithRanks();
    await endHandler(authedEvent(null, 'DELETE', `/races/admin/${admin_code}`,
      undefined, { admin_code }));

    const raceHorses = await listHorses(race_id);
    const awarded = raceHorses.map(h => (h as any).xp_awarded as number | undefined);
    expect(awarded.every(v => typeof v === 'number')).toBe(true);
    expect([...awarded].sort((a, b) => a! - b!)).toEqual([27, 58, 77, 95]);
  });

  it('is idempotent — re-running finaliseRace does not double-award', async () => {
    const { horses, race_id } = await setupRaceWithRanks();
    // First finalise: real one through end-race.
    const race = await getRaceById(race_id);
    await finaliseRace(race!, new Date());

    const xpAfterFirst = await Promise.all(horses.map(h => getStableXp(h.user)));

    // Second call (idempotent — race.ended_at is now set so it short-circuits;
    // but even if we force re-entry by passing the pre-ended snapshot, the
    // per-horse xp_awarded conditional prevents repeats).
    const raceAfter = await getRaceById(race_id);
    await finaliseRace(raceAfter!, new Date());
    await finaliseRace({ ...race!, ended_at: undefined }, new Date()); // pre-end snapshot

    const xpAfterSecond = await Promise.all(horses.map(h => getStableXp(h.user)));
    expect(xpAfterSecond).toEqual(xpAfterFirst);
  });

  it('forfeits XP when the stable horse was deleted before race end (race horse still marked)', async () => {
    const { admin_code, race_id, horses } = await setupRaceWithRanks();
    // Winner deletes their stable horse before the race ends.
    const winner = horses[0]!;
    const { handler: deleteStableHorse } = await import('../../src/handlers/delete-stable-horse.js');
    const delRes: any = await deleteStableHorse(authedEvent(winner.user, 'DELETE',
      `/jockey/me/horses/${winner.stable_horse_id}`, undefined,
      { stable_horse_id: winner.stable_horse_id }));
    expect(delRes.statusCode).toBe(200);

    await endHandler(authedEvent(null, 'DELETE', `/races/admin/${admin_code}`,
      undefined, { admin_code }));

    // Winner's stable is empty (no XP went anywhere).
    const list: any = await listStable(authedEvent(winner.user, 'GET', '/jockey/me/horses'));
    expect(JSON.parse(list.body).horses).toEqual([]);

    // But the race horse still has xp_awarded stamped (so we don't retry forever).
    const raceHorses = await listHorses(race_id);
    const winnerRaceHorse = raceHorses.find(h => h.horse_id === winner.horse_id)!;
    expect((winnerRaceHorse as any).xp_awarded).toBe(95);
  });

  it('single-participant race: that horse is rank 1 and gets 95 XP (80 position + 15 winner bonus)', async () => {
    const creator = await makeUser('XP_Solo_Creator');
    const soloist = await makeUser('XP_Solo');
    const h = await makeHorse(soloist, 'Solo', COLORS);
    const createRes: any = await createHandler(authedEvent(creator, 'POST', '/races', {
      name: 'Solo Race',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }));
    const { join_code, admin_code } = JSON.parse(createRes.body);
    const joinRes: any = await joinHandler(authedEvent(soloist, 'POST', `/races/${join_code}/join`,
      { stable_horse_id: h.stable_horse_id }, { join_code }));
    const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
    await hbHandler(authedEvent(null, 'POST',
      `/races/${join_code}/horses/${horse_id}/heartbeat`,
      { current_tokens: 42 },
      { join_code, horse_id }, heartbeat_token,
    ));

    await endHandler(authedEvent(null, 'DELETE', `/races/admin/${admin_code}`,
      undefined, { admin_code }));

    expect(await getStableXp(soloist)).toBe(95);
  });
});
