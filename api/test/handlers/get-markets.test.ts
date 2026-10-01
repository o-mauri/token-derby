import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as getMarketsHandler } from '../../src/handlers/get-markets.js';
import { putLeague } from '../../src/db/leagues.js';
import { ensureStanding } from '../../src/db/league-standings.js';
import { setRaceEndedIfAbsent } from '../../src/db/races.js';
import { makeUser, authHeaders } from '../helpers/auth-helper.js';
import { seedLiveRace } from '../helpers/races.js';
import { putWebSession } from '../../src/db/web-sessions.js';
import { addMember } from '../../src/db/organisations.js';
import { putHabitRows, ORG_HABIT_ID } from '../../src/db/habits.js';
import { putStableHorse } from '../../src/db/stable.js';
import { encodeDensity, fitDensity } from '@token-derby/shared';
import type { GetMarketsResponse } from '@token-derby/shared';

function evt(join_code: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /races/{join_code}/markets',
    rawPath: `/races/${join_code}/markets`,
    rawQueryString: '',
    pathParameters: { join_code },
    headers: {},
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

describe('get-markets handler', () => {
  it('404s on an unknown join code', async () => {
    const res: any = await getMarketsHandler(evt('NOPE99'));
    expect(res.statusCode).toBe(404);
  });

  it('returns open:false with a positive countdown before the market opens', async () => {
    // 10 minutes old, well under MARKET_OPEN_MIN (20).
    const { race } = await seedLiveRace({ runners: 3, elapsedMin: 10 });
    const res: any = await getMarketsHandler(evt(race.join_code));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as GetMarketsResponse;
    expect(body.open).toBe(false);
    expect(body.open === false && body.opens_in_seconds).toBeGreaterThan(0);
  });

  it('returns open:true with one price per horse once the market has opened', async () => {
    const { race, horses } = await seedLiveRace({ runners: 3, elapsedMin: 60 });
    const res: any = await getMarketsHandler(evt(race.join_code));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as GetMarketsResponse;
    expect(body.open).toBe(true);
    if (body.open) {
      expect(body.snapshot.prices).toHaveLength(horses.length);
      expect(body.horses).toHaveLength(horses.length);
    }
  });

  it('returns open:false with no countdown once the race has finished', async () => {
    const { race } = await seedLiveRace({ runners: 3, elapsedMin: 60 });
    await setRaceEndedIfAbsent(race.race_id, new Date().toISOString());
    const res: any = await getMarketsHandler(evt(race.join_code));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as GetMarketsResponse;
    expect(body.open).toBe(false);
    expect(body.open === false && body.opens_in_seconds).toBeUndefined();
  });

  it('prices win and podium within each division for a league race', async () => {
    const org_id = `org-${randomUUID()}`;
    await putLeague({
      org_id,
      divisions: [{ name: 'Div 1', cap: 10 }, { name: 'Div 2', cap: 10 }],
      boundaries: [2],
      races_per_season: 8,
      weekdays: [1], start_local: '09:00', end_local: '17:00', tz: 'UTC',
      current_season: 1, status: 'active', created_at: 'c',
      creator_user_id: 'u1', creator_user_name: 'Owner',
    });

    const { race, horses } = await seedLiveRace({
      runners: 4, elapsedMin: 60, league: { league_id: org_id, season: 1 },
    });
    // horses[0..1] have a standing in division 1; horses[2..3] have none and
    // so default to the bottom division (2).
    for (const h of horses.slice(0, 2)) {
      await ensureStanding({
        org_id, season: 1, division: 1, stable_horse_id: h.stable_horse_id,
        horse_name: h.name, user_id: h.user_id, user_name: h.user_name,
        points: 5, season_tokens: 100, entered_at: race.start_time,
      });
    }

    const res: any = await getMarketsHandler(evt(race.join_code));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as GetMarketsResponse;
    expect(body.open).toBe(true);
    if (!body.open) return;

    const byHorse = new Map(horses.map((h, i) => [h.horse_id, i]));
    const div1 = body.snapshot.prices.filter((p) => byHorse.get(p.horse_id)! < 2);
    const div2 = body.snapshot.prices.filter((p) => byHorse.get(p.horse_id)! >= 2);
    expect(div1).toHaveLength(2);
    expect(div2).toHaveLength(2);
    for (const p of [...div1, ...div2]) expect(p.division).not.toBeNull();
    expect(div1.reduce((s, p) => s + (p.division ?? 0), 0)).toBeCloseTo(1, 1);
    expect(div2.reduce((s, p) => s + (p.division ?? 0), 0)).toBeCloseTo(1, 1);
  });

  it('returns identical bodies for two calls in the same second', async () => {
    // Structural equality, not raw string equality: DynamoDB doesn't
    // guarantee attribute order, so a freshly-computed snapshot and one
    // round-tripped through the store can serialise with different key
    // order despite carrying byte-identical values.
    const { race } = await seedLiveRace({ runners: 3, elapsedMin: 60 });
    const a: any = await getMarketsHandler(evt(race.join_code));
    const b: any = await getMarketsHandler(evt(race.join_code));
    expect(JSON.parse(b.body)).toEqual(JSON.parse(a.body));
  });
});

function authedEvt(join_code: string, token?: string): APIGatewayProxyEventV2 {
  const e = evt(join_code);
  return { ...e, headers: token ? { authorization: `Bearer ${token}` } : {} };
}

async function raceWithNotJoined() {
  const org = `org-${randomUUID()}`;
  const { race } = await seedLiveRace({ runners: 2, elapsedMin: 60, orgId: org, durationHours: 8 });
  const uid = `nj-${randomUUID()}`;
  const shId = `sh-${randomUUID()}`;
  await putStableHorse(uid, {
    stable_horse_id: shId, name: 'Late Arrival', colors: { body: '#abcdef', mane: '#000', tail: '#000', saddle: '#fff' },
    xp: 0, recent_paces: [15_000], created_at: new Date().toISOString(),
  } as any);
  const matrix = encodeDensity(fitDensity([{ arrival: 600, departure: 1000 }, { arrival: 620, departure: 1010 }])!);
  const row = (user_id: string, extra = {}) => ({
    user_id, is_debutant: user_id === ORG_HABIT_ID, login_propensity: 0.9, avg_daily_race_hours: 7,
    peak_activity_window: { start: '10:00', end: '13:00' }, hourly_probability_array: new Array(24).fill(0),
    span_count: 2, last_updated: new Date(Date.now() + 3_600_000).toISOString(), habit_matrix_data: matrix, ...extra,
  });
  await putHabitRows(org, [row(uid, { stable_horse_id: shId }), row(ORG_HABIT_ID)]);
  return { org, race };
}

describe('get-markets not-joined visibility', () => {
  it('shows not-joined runners to a signed-in org member', async () => {
    const { org, race } = await raceWithNotJoined();
    await addMember(org, 'member-1', new Date().toISOString());
    const token = `ws-${randomUUID()}`;
    await putWebSession(token, 'member-1', 'Member', new Date(Date.now() + 3_600_000).toISOString(), 3600);
    const body = JSON.parse(((await getMarketsHandler(authedEvt(race.join_code, token))) as any).body);
    expect(body.horses.some((h: any) => h.joined === false && h.name === 'Late Arrival')).toBe(true);
    expect(body.snapshot.prices.some((p: any) => !p.joined)).toBe(true);
  });

  it('hides them from anonymous readers', async () => {
    const { race } = await raceWithNotJoined();
    const body = JSON.parse(((await getMarketsHandler(authedEvt(race.join_code))) as any).body);
    expect(body.horses.every((h: any) => h.joined)).toBe(true);
    expect(body.snapshot.prices.every((p: any) => p.joined)).toBe(true);
    expect(body.snapshot.not_joined).toEqual([]);
  });

  it('hides them from a signed-in user outside the org', async () => {
    const { race } = await raceWithNotJoined();
    const token = `ws-${randomUUID()}`;
    await putWebSession(token, 'outsider', 'Outsider', new Date(Date.now() + 3_600_000).toISOString(), 3600);
    const body = JSON.parse(((await getMarketsHandler(authedEvt(race.join_code, token))) as any).body);
    expect(body.snapshot.prices.every((p: any) => p.joined)).toBe(true);
    expect(body.horses.every((h: any) => h.joined)).toBe(true);
    expect(body.snapshot.not_joined).toEqual([]);
  });

  it('ignores CLI identity headers when the Authorization header is not a bearer token', async () => {
    const { org, race } = await raceWithNotJoined();
    const user = await makeUser('Cli Member');
    await addMember(org, user.user_id, new Date().toISOString());
    const e = { ...evt(race.join_code), headers: { authorization: 'Basic xyz', ...authHeaders(user) } };
    const body = JSON.parse(((await getMarketsHandler(e)) as any).body);
    expect(body.horses.every((h: any) => h.joined)).toBe(true);
    expect(body.snapshot.not_joined).toEqual([]);
  });

  it('treats an expired or malformed token as anonymous, not 401', async () => {
    const { race } = await raceWithNotJoined();
    const res: any = await getMarketsHandler(authedEvt(race.join_code, 'not-a-real-session'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).snapshot.prices.every((p: any) => p.joined)).toBe(true);
  });
});
