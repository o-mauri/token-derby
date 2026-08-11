import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as getMarketsHandler } from '../../src/handlers/get-markets.js';
import { putLeague } from '../../src/db/leagues.js';
import { ensureStanding } from '../../src/db/league-standings.js';
import { setRaceEndedIfAbsent } from '../../src/db/races.js';
import { seedLiveRace } from '../helpers/races.js';
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
