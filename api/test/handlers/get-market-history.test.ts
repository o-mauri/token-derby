import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as getMarketHistoryHandler } from '../../src/handlers/get-market-history.js';
import { ensureSnapshot } from '../../src/lib/price-race.js';
import { seedLiveRace } from '../helpers/races.js';
import { putWebSession } from '../../src/db/web-sessions.js';
import { addMember } from '../../src/db/organisations.js';
import { putHabitRows, ORG_HABIT_ID } from '../../src/db/habits.js';
import { putStableHorse } from '../../src/db/stable.js';
import { encodeDensity, fitDensity } from '@token-derby/shared';
import { listHorses } from '../../src/db/horses.js';
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


describe('get-market-history not-joined visibility', () => {
  async function withHistory() {
    const { org, race } = await raceWithNotJoined();
    // A bucket divisible by HISTORY_INTERVAL_MIN (5) is written to history.
    const t = Math.ceil(Date.now() / 300_000) * 300_000;
    await ensureSnapshot(race, await listHorses(race.race_id), t);
    return { org, race };
  }

  it('keeps not-joined prices for an org member', async () => {
    const { org, race } = await withHistory();
    await addMember(org, 'member-h', new Date().toISOString());
    const token = `ws-${randomUUID()}`;
    await putWebSession(token, 'member-h', 'Member', new Date(Date.now() + 3_600_000).toISOString(), 3600);
    const e = { ...evt(race.join_code), headers: { authorization: `Bearer ${token}` } };
    const body = JSON.parse(((await getMarketHistoryHandler(e)) as any).body) as GetMarketHistoryResponse;
    expect(body.history.at(-1)!.prices.some((p) => !p.joined)).toBe(true);
    expect(body.history.at(-1)!.not_joined).toHaveLength(1);
  });

  it('strips them for anonymous readers', async () => {
    const { race } = await withHistory();
    const body = JSON.parse(((await getMarketHistoryHandler(evt(race.join_code))) as any).body) as GetMarketHistoryResponse;
    expect(body.history.at(-1)!.prices.every((p) => p.joined)).toBe(true);
    expect(body.history.at(-1)!.not_joined).toEqual([]);
  });
});
