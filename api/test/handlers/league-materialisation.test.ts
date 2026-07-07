import { describe, it, expect, afterEach, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { handler as tick } from '../../src/handlers/schedule-tick.js';
import { putLeague } from '../../src/db/leagues.js';
import { getLeagueSeason } from '../../src/db/league-seasons.js';
import { listRacesByOrgId } from '../../src/db/races.js';
import { makeUser, type TestUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';
import type { League } from '@token-derby/shared';

const runTick = () => (tick as unknown as () => Promise<void>)();

async function createOrg(user: TestUser, name: string): Promise<string> {
  const ev: APIGatewayProxyEventV2 = {
    version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
    headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': user.user_id, 'x-user-token': user.secret_token },
    requestContext: {} as any, body: JSON.stringify({ name }), isBase64Encoded: false,
  };
  const res: any = await createOrgHandler(ev);
  if (res.statusCode !== 200) throw new Error(`create-org failed: ${res.body}`);
  return JSON.parse(res.body).org_id;
}

function baseLeague(org_id: string, over: Partial<League> = {}): League {
  return {
    org_id, divisions: 3, racers_per_division: 10, races_per_season: 8, promote_relegate_count: 2,
    weekdays: [1, 2, 3, 4, 5], start_local: '09:00', end_local: '17:30', tz: 'UTC',
    current_season: 1, status: 'active',
    created_at: '2026-07-01T00:00:00.000Z', creator_user_id: 'u1', creator_user_name: 'Alice',
    ...over,
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('league fixture materialisation (via schedule-tick)', () => {
  it('creates a round-1 fixture inside the window, named and tagged, and is idempotent', async () => {
    const user = await makeUser('LgTickOwn');
    const org_id = await createOrg(user, 'LgTickOrg1');
    await putLeague(baseLeague(org_id, { race_name: 'Anthropic League' }));

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T10:00:00Z')); // Monday, inside 09:00–17:30

    await runTick();
    let races = await listRacesByOrgId(org_id);
    expect(races.length).toBe(1);
    expect(races[0]!.name).toBe('Anthropic League (League Race (1/8))');
    expect(races[0]!).toMatchObject({ league_id: org_id, league_season: 1, league_round: 1 });
    expect((await getLeagueSeason(org_id, 1))?.fixtures_materialised).toBe(1);

    await runTick(); // same day → no second fixture
    races = await listRacesByOrgId(org_id);
    expect(races.length).toBe(1);
  });

  it('does not create a fixture outside the weekday window', async () => {
    const user = await makeUser('LgTickOwn2');
    const org_id = await createOrg(user, 'LgTickOrg2');
    await putLeague(baseLeague(org_id, { weekdays: [6] })); // Saturday only
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T10:00:00Z')); // Monday
    await runTick();
    expect((await listRacesByOrgId(org_id)).length).toBe(0);
  });

  it('does not create a fixture outside the time window', async () => {
    const user = await makeUser('LgTickOwn3');
    const org_id = await createOrg(user, 'LgTickOrg3');
    await putLeague(baseLeague(org_id, { start_local: '09:00', end_local: '10:00' }));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T12:00:00Z')); // Monday, after the window
    await runTick();
    expect((await listRacesByOrgId(org_id)).length).toBe(0);
  });

  it('stops materialising once the season reaches races_per_season', async () => {
    const user = await makeUser('LgTickOwn4');
    const org_id = await createOrg(user, 'LgTickOrg4');
    await putLeague(baseLeague(org_id, { races_per_season: 2, race_name: 'Cap League' }));
    // Three consecutive weekdays; only the first two produce fixtures.
    for (const day of ['2026-07-06T10:00:00Z', '2026-07-07T10:00:00Z', '2026-07-08T10:00:00Z']) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(day));
      await runTick();
      vi.useRealTimers();
    }
    const races = await listRacesByOrgId(org_id);
    expect(races.length).toBe(2);
    expect((await getLeagueSeason(org_id, 1))?.fixtures_materialised).toBe(2);

    // Pin the "X/N" display + round tag end-to-end: the two fixtures are rounds
    // 1 and 2 of 2, named and tagged accordingly.
    const round2 = races.find(r => r.league_round === 2);
    expect(round2).toBeDefined();
    expect(round2!.name).toBe('Cap League (League Race (2/2))');
    expect(round2).toMatchObject({ league_id: org_id, league_season: 1, league_round: 2 });
  });
});
