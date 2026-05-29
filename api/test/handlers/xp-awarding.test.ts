import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

// Finalisation instant that clears the duration half of the anti-farm gate.
// The race is created "now", so finalising 3h+1m out makes the live duration
// ≥3h → full duration factor. Paired with ≥3 jockeys this yields full XP.
const FINALISE_FULL = () => new Date(Date.now() + 3 * 3_600_000 + 60_000);

function authedEvent(
  user: TestUser | null,
  method: string,
  path: string,
  body?: unknown,
  pathParameters?: Record<string, string>,
  bearer?: string,
): APIGatewayProxyEventV2 {
  const headers: Record<string, string> = { 'x-cli-version': '2.6.0' };
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
      { seq: 1, delta: tokensByPlace[i]! },
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

async function getStableHorse(user: TestUser): Promise<any> {
  const res: any = await listStable(authedEvent(user, 'GET', '/jockey/me/horses'));
  return JSON.parse(res.body).horses[0];
}

describe('XP awarding on race end', () => {
  beforeEach(() => { process.env.TOKEN_DERBY_MAX_RATE = '1000000000'; });
  afterEach(() => { delete process.env.TOKEN_DERBY_MAX_RATE; });

  // tokensByPlace = [1000, 800, 500, 100], winner = 1000
  // Position XP + token bonus:
  //   Rank 1: 80 + 15 (flat winner)        = 95
  //   Rank 2: 65 + round(800/1000 * 15)=12 = 77
  //   Rank 3: 50 + round(500/1000 * 15)=8  = 58
  //   Rank 4: 25 + round(100/1000 * 15)=2  = 27
  it('awards position XP + token bonus to ranks 1/2/3/4 (4 jockeys, ≥3h → full)', async () => {
    const { race_id, horses } = await setupRaceWithRanks();

    // 4 distinct jockeys and a ≥3h run clear the anti-farm gate at full rate.
    const race = await getRaceById(race_id);
    await finaliseRace(race!, FINALISE_FULL());

    expect(await getStableXp(horses[0]!.user)).toBe(95); // winner
    expect(await getStableXp(horses[1]!.user)).toBe(77); // runner-up
    expect(await getStableXp(horses[2]!.user)).toBe(58); // podium
    expect(await getStableXp(horses[3]!.user)).toBe(27); // also-ran
  });

  it('stamps xp_awarded on each race horse', async () => {
    const { race_id } = await setupRaceWithRanks();
    const race = await getRaceById(race_id);
    await finaliseRace(race!, FINALISE_FULL());

    const raceHorses = await listHorses(race_id);
    const awarded = raceHorses.map(h => (h as any).xp_awarded as number | undefined);
    expect(awarded.every(v => typeof v === 'number')).toBe(true);
    expect([...awarded].sort((a, b) => a! - b!)).toEqual([27, 58, 77, 95]);
  });

  it('is idempotent — re-running finaliseRace does not double-award', async () => {
    const { horses, race_id } = await setupRaceWithRanks();
    // First finalise at full rate (≥3 jockeys, ≥3h) so the no-double-award
    // assertion is meaningful against non-zero XP.
    const race = await getRaceById(race_id);
    await finaliseRace(race!, FINALISE_FULL());

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
    const { race_id, horses } = await setupRaceWithRanks();
    // Winner deletes their stable horse before the race ends.
    const winner = horses[0]!;
    const { handler: deleteStableHorse } = await import('../../src/handlers/delete-stable-horse.js');
    const delRes: any = await deleteStableHorse(authedEvent(winner.user, 'DELETE',
      `/jockey/me/horses/${winner.stable_horse_id}`, undefined,
      { stable_horse_id: winner.stable_horse_id }));
    expect(delRes.statusCode).toBe(200);

    // Full-rate finalise (≥3 jockeys, ≥3h) so the winner's marker would be 95.
    const race = await getRaceById(race_id);
    await finaliseRace(race!, FINALISE_FULL());

    // Winner's stable is empty (no XP went anywhere).
    const list: any = await listStable(authedEvent(winner.user, 'GET', '/jockey/me/horses'));
    expect(JSON.parse(list.body).horses).toEqual([]);

    // But the race horse still has xp_awarded stamped (so we don't retry forever).
    const raceHorses = await listHorses(race_id);
    const winnerRaceHorse = raceHorses.find(h => h.horse_id === winner.horse_id)!;
    expect((winnerRaceHorse as any).xp_awarded).toBe(95);
  });

  it('records lifetime race stats on each stable horse', async () => {
    const { admin_code, horses } = await setupRaceWithRanks();

    await endHandler(authedEvent(null, 'DELETE', `/races/admin/${admin_code}`,
      undefined, { admin_code }));

    // Winner (rank 1, 1000 tokens)
    const winner = await getStableHorse(horses[0]!.user);
    expect(winner.races_entered).toBe(1);
    expect(winner.wins).toBe(1);
    expect(winner.podiums).toBe(1);
    expect(winner.total_tokens).toBe(1000);
    expect(winner.total_finishing_position).toBe(1);

    // Rank 2 (800 tokens) — podium, not a win
    const second = await getStableHorse(horses[1]!.user);
    expect(second.races_entered).toBe(1);
    expect(second.wins).toBe(0);
    expect(second.podiums).toBe(1);
    expect(second.total_tokens).toBe(800);
    expect(second.total_finishing_position).toBe(2);

    // Rank 3 (500 tokens) — podium
    const third = await getStableHorse(horses[2]!.user);
    expect(third.podiums).toBe(1);
    expect(third.total_finishing_position).toBe(3);

    // Rank 4 (100 tokens) — no podium
    const fourth = await getStableHorse(horses[3]!.user);
    expect(fourth.wins).toBe(0);
    expect(fourth.podiums).toBe(0);
    expect(fourth.total_tokens).toBe(100);
    expect(fourth.total_finishing_position).toBe(4);
  });

  it('stats are idempotent — re-running finaliseRace does not double-count', async () => {
    const { horses, race_id } = await setupRaceWithRanks();
    const race = await getRaceById(race_id);
    await finaliseRace(race!, new Date());

    const statsAfterFirst = await Promise.all(horses.map(h => getStableHorse(h.user)));

    // Force re-entry with a pre-end snapshot — the per-horse xp_awarded marker
    // is what gates both the XP and stats writes.
    await finaliseRace({ ...race!, ended_at: undefined }, new Date());

    const statsAfterSecond = await Promise.all(horses.map(h => getStableHorse(h.user)));
    for (let i = 0; i < statsAfterFirst.length; i++) {
      expect(statsAfterSecond[i].races_entered).toBe(statsAfterFirst[i].races_entered);
      expect(statsAfterSecond[i].wins).toBe(statsAfterFirst[i].wins);
      expect(statsAfterSecond[i].podiums).toBe(statsAfterFirst[i].podiums);
      expect(statsAfterSecond[i].total_tokens).toBe(statsAfterFirst[i].total_tokens);
      expect(statsAfterSecond[i].total_finishing_position).toBe(statsAfterFirst[i].total_finishing_position);
    }
  });

  // Anti-farm gate (the "infinite horses, one layer down" fix): a solo
  // self-race — create a free race, join your own horse, end it — must grant
  // ZERO persistent XP, even if it ran for hours, because 1 jockey fails the
  // gate outright. This is the loop that would otherwise mint unlimited rolls.
  async function setupSoloRace(): Promise<{ soloist: TestUser; race_id: string; admin_code: string; horse_id: string; heartbeat_token: string }> {
    const creator = await makeUser('XP_Solo_Creator');
    const soloist = await makeUser('XP_Solo');
    const h = await makeHorse(soloist, 'Solo', COLORS);
    const createRes: any = await createHandler(authedEvent(creator, 'POST', '/races', {
      name: 'Solo Race',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }));
    const { race_id, join_code, admin_code } = JSON.parse(createRes.body);
    const joinRes: any = await joinHandler(authedEvent(soloist, 'POST', `/races/${join_code}/join`,
      { stable_horse_id: h.stable_horse_id }, { join_code }));
    const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
    await hbHandler(authedEvent(null, 'POST',
      `/races/${join_code}/horses/${horse_id}/heartbeat`,
      { seq: 1, delta: 42 },
      { join_code, horse_id }, heartbeat_token,
    ));
    return { soloist, race_id, admin_code, horse_id, heartbeat_token };
  }

  it('solo race ended instantly grants 0 XP (gate: 1 jockey + <2h)', async () => {
    const { soloist, admin_code } = await setupSoloRace();
    await endHandler(authedEvent(null, 'DELETE', `/races/admin/${admin_code}`,
      undefined, { admin_code }));
    expect(await getStableXp(soloist)).toBe(0);
  });

  it('solo race that ran ≥3h still grants 0 XP (1 jockey fails the gate regardless of duration)', async () => {
    const { soloist, race_id } = await setupSoloRace();
    const race = await getRaceById(race_id);
    await finaliseRace(race!, FINALISE_FULL());
    expect(await getStableXp(soloist)).toBe(0);
  });

  it('4-jockey race that only ran ~2.5h grants HALF XP (duration factor, no stacking)', async () => {
    const { race_id, horses } = await setupRaceWithRanks();
    const race = await getRaceById(race_id);
    // 4 jockeys (full) but 2.5h (half) → min = 0.5. Not 0.25.
    await finaliseRace(race!, new Date(Date.now() + 2.5 * 3_600_000));
    expect(await getStableXp(horses[0]!.user)).toBe(48); // round(95 * 0.5)
    expect(await getStableXp(horses[1]!.user)).toBe(39); // round(77 * 0.5)
    expect(await getStableXp(horses[2]!.user)).toBe(29); // round(58 * 0.5)
    expect(await getStableXp(horses[3]!.user)).toBe(14); // round(27 * 0.5)
  });

  it('2-jockey race over ≥3h grants HALF XP (jockey factor)', async () => {
    const creator = await makeUser('XP_2J_Creator');
    const createRes: any = await createHandler(authedEvent(creator, 'POST', '/races', {
      name: 'Duel',
      start_time: new Date(Date.now() - 60_000).toISOString(),
      end_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      tz: 'UTC',
    }));
    const { race_id, join_code } = JSON.parse(createRes.body);
    const tokensByPlace = [1000, 800];
    const users: TestUser[] = [];
    for (let i = 0; i < tokensByPlace.length; i++) {
      const u = await makeUser(`XP_2J_${i + 1}`);
      users.push(u);
      const h = await makeHorse(u, `D${i + 1}`, COLORS);
      const joinRes: any = await joinHandler(authedEvent(u, 'POST', `/races/${join_code}/join`,
        { stable_horse_id: h.stable_horse_id }, { join_code }));
      const { horse_id, heartbeat_token } = JSON.parse(joinRes.body);
      await hbHandler(authedEvent(null, 'POST',
        `/races/${join_code}/horses/${horse_id}/heartbeat`,
        { seq: 1, delta: tokensByPlace[i]! }, { join_code, horse_id }, heartbeat_token));
    }
    const race = await getRaceById(race_id);
    await finaliseRace(race!, FINALISE_FULL());
    expect(await getStableXp(users[0]!)).toBe(48); // round(95 * 0.5)
    expect(await getStableXp(users[1]!)).toBe(39); // round(77 * 0.5)
  });
});
