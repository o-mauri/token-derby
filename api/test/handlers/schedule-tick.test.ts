import { describe, it, expect, afterEach, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { handler as tick } from '../../src/handlers/schedule-tick.js';
import { putSchedule } from '../../src/db/schedules.js';
import { listRacesByOrgId } from '../../src/db/races.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import type { RaceSchedule } from '@token-derby/shared';

const runTick = () => (tick as unknown as () => Promise<void>)();

async function createOrg(user: TestUser, name: string): Promise<string> {
  const ev: APIGatewayProxyEventV2 = {
    version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': '2.6.0', 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, body: JSON.stringify({ name }), isBase64Encoded: false,
  };
  const res: any = await createOrgHandler(ev);
  if (res.statusCode !== 200) throw new Error(`create-org failed: ${res.body}`);
  return JSON.parse(res.body).org_id;
}

function baseSchedule(org_id: string): RaceSchedule {
  return {
    org_id, weekdays: [1, 2, 3, 4, 5], start_local: '09:00', end_local: '17:30', tz: 'UTC',
    created_at: '2024-07-01T00:00:00.000Z', creator_user_id: 'u1', creator_user_name: 'Alice',
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('schedule-tick', () => {
  it('creates the day race inside the window and is idempotent', async () => {
    const user = await makeUser('TickOwn');
    const org_id = await createOrg(user, 'TickOrg1');
    await putSchedule(baseSchedule(org_id));

    // 2024-07-01 is a Monday; 10:00 UTC is inside 09:00–17:30.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-01T10:00:00Z'));

    await runTick();
    let races = await listRacesByOrgId(org_id);
    expect(races.length).toBe(1);
    expect(races[0]!.start_time).toBe('2024-07-01T09:00:00.000Z');
    expect(races[0]!.end_time).toBe('2024-07-01T17:30:00.000Z');
    expect(races[0]!.creator_user_name).toBe('Alice');
    expect(races[0]!.org_id).toBe(org_id);

    // Same minute again -> claim marker prevents a duplicate.
    await runTick();
    races = await listRacesByOrgId(org_id);
    expect(races.length).toBe(1);
  });

  it('does nothing before the window opens', async () => {
    const user = await makeUser('TickEarly');
    const org_id = await createOrg(user, 'TickEarly1');
    await putSchedule(baseSchedule(org_id));

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-01T08:00:00Z')); // before 09:00

    await runTick();
    expect((await listRacesByOrgId(org_id)).length).toBe(0);
  });

  it('does nothing on an inactive weekday', async () => {
    const user = await makeUser('TickSat');
    const org_id = await createOrg(user, 'TickSat1');
    await putSchedule(baseSchedule(org_id)); // weekdays Mon–Fri

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-06T10:00:00Z')); // 2024-07-06 is a Saturday

    await runTick();
    expect((await listRacesByOrgId(org_id)).length).toBe(0);
  });
});
