import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as getMarketHistoryHandler } from '../../src/handlers/get-market-history.js';
import { ensureSnapshot } from '../../src/lib/price-race.js';
import { seedLiveRace } from '../helpers/races.js';
import type { GetMarketHistoryResponse } from '@token-derby/shared';

function evt(join_code: string): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: 'GET /races/{join_code}/markets/history',
    rawPath: `/races/${join_code}/markets/history`,
    rawQueryString: '',
    pathParameters: { join_code },
    headers: {},
    requestContext: {} as any,
    isBase64Encoded: false,
  };
}

describe('get-market-history handler', () => {
  it('404s on an unknown join code', async () => {
    const res: any = await getMarketHistoryHandler(evt('NOPE99'));
    expect(res.statusCode).toBe(404);
  });

  it('returns an empty history for a race with no recorded buckets yet', async () => {
    const { race } = await seedLiveRace({ runners: 2, elapsedMin: 60 });
    const res: any = await getMarketHistoryHandler(evt(race.join_code));
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as GetMarketHistoryResponse;
    expect(body.history).toEqual([]);
  });

  it('returns recorded snapshots after a history-eligible bucket has been priced', async () => {
    const { race, horses } = await seedLiveRace({ runners: 2, elapsedMin: 60 });
    const base = Math.floor(Date.now() / 300_000) * 300_000;   // aligned to a 5-min boundary
    await ensureSnapshot(race, horses, base);
    const res: any = await getMarketHistoryHandler(evt(race.join_code));
    const body = JSON.parse(res.body) as GetMarketHistoryResponse;
    expect(body.history).toHaveLength(1);
    expect(body.history[0]!.race_id).toBe(race.race_id);
  });
});
