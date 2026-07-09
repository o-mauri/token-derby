import { describe, it, expect } from 'vitest';
import { rolloverDueLeague } from '../../src/lib/rollover-league.js';
import { putLeague, getLeague } from '../../src/db/leagues.js';
import { ensureLeagueSeason, getLeagueSeason, stampFinalFixtureEnd } from '../../src/db/league-seasons.js';
import { ensureStanding, listSeasonStandings, tryMarkPrizeAwarded } from '../../src/db/league-standings.js';
import { getSeasonResult } from '../../src/db/league-results.js';
import { getStableHorse } from '../../src/db/stable.js';
import { setOrgWebhook, getOrganisationByName } from '../../src/db/organisations.js';
import { handler as createOrgHandler } from '../../src/handlers/create-organisation.js';
import { makeUser } from '../helpers/auth-helper.js';
import { CURRENT_CLI_VERSION } from '../helpers/cli-version.js';
import { putHorseForTest } from '../helpers/horse-seed.js';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { League, LeagueStanding } from '@token-derby/shared';

function league(org_id: string, over: Partial<League> = {}): League {
  return {
    org_id, divisions: [{ name: 'D1', cap: 2 }, { name: 'D2', cap: 2 }, { name: 'D3', cap: 9 }], boundaries: [1, 1],
    races_per_season: 4, weekdays: [1], start_local: '09:00', end_local: '17:00', tz: 'UTC',
    current_season: 1, status: 'active', created_at: 'c', creator_user_id: 'u', creator_user_name: 'C', ...over,
  };
}
function st(org_id: string, over: Partial<LeagueStanding>): LeagueStanding {
  return { org_id, season: 1, division: 3, stable_horse_id: 's', horse_name: 'H', user_id: 'u', user_name: 'U', points: 0, season_tokens: 0, entered_at: '2026-07-07T00:00:00Z', ...over };
}
const PAST = '2026-07-20T17:00:00.000Z';
const AFTER = new Date('2026-07-20T17:05:00.000Z');

describe('rolloverDueLeague', () => {
  it('is a no-op when the season is not full/ended (no final_fixture_end)', async () => {
    const org = 'RollX1';
    await putLeague(league(org));
    await ensureLeagueSeason(org, 1); // no final_fixture_end stamped
    expect(await rolloverDueLeague(league(org), AFTER)).toBe(false);
    expect((await getLeague(org))?.current_season).toBe(1);
  });

  it('is a no-op when final_fixture_end is in the future', async () => {
    const org = 'RollX2';
    await putLeague(league(org));
    await ensureLeagueSeason(org, 1);
    await stampFinalFixtureEnd(org, 1, '2999-01-01T00:00:00.000Z');
    expect(await rolloverDueLeague(league(org), AFTER)).toBe(false);
  });

  it('season 1 → 2: full-seeds by points, awards prizes once, writes summary, bumps season', async () => {
    const org = 'RollX3';
    const u = 'user-roll3';
    await putLeague(league(org));
    await ensureLeagueSeason(org, 1);
    await stampFinalFixtureEnd(org, 1, PAST);
    // 5 horses in the season-1 pool (division 3), points 50..10; each owned by user u.
    const ids = ['a', 'b', 'c', 'd', 'e'];
    for (let i = 0; i < ids.length; i++) {
      await putHorseForTest(u, ids[i]!);
      await ensureStanding(st(org, { division: 3, stable_horse_id: ids[i]!, horse_name: ids[i]!, user_id: u, points: 50 - i * 10, season_tokens: 1000 - i }));
    }
    expect(await rolloverDueLeague(league(org), AFTER)).toBe(true);

    // caps 2/2/overflow → a,b → div1 ; c,d → div2 ; e → div3
    const s2 = await listSeasonStandings(org, 2);
    const div = Object.fromEntries(s2.map(r => [r.stable_horse_id, r.division]));
    expect(div).toEqual({ a: 1, b: 1, c: 2, d: 2, e: 3 });
    expect(s2.every(r => r.points === 0 && r.season_tokens === 0)).toBe(true);
    // season bumped
    expect((await getLeague(org))?.current_season).toBe(2);
    // summary written; champion is the pool winner 'a'
    const res = await getSeasonResult(org, 1);
    expect(res?.champion?.stable_horse_id).toBe('a');
    expect(res?.division_names).toEqual(['D1', 'D2', 'D3']);
    // prize marks set on the season-1 rows
    expect((await listSeasonStandings(org, 1)).every(r => r.prize_awarded === true)).toBe(true);
  });

  it('re-running after a completed rollover does not double-run (idempotent)', async () => {
    const org = 'RollX4';
    const u = 'user-roll4';
    await putLeague(league(org));
    await ensureLeagueSeason(org, 1);
    await stampFinalFixtureEnd(org, 1, PAST);
    await putHorseForTest(u, 'a');
    await ensureStanding(st(org, { division: 3, stable_horse_id: 'a', user_id: u, points: 10, season_tokens: 5 }));
    expect(await rolloverDueLeague(await getLeague(org) as League, AFTER)).toBe(true);
    // second call: league now at season 2 (no final_fixture_end on season 2) → not due
    expect(await rolloverDueLeague(await getLeague(org) as League, AFTER)).toBe(false);
    expect((await getLeague(org))?.current_season).toBe(2);
  });

  it('applies staged pending_structural (shape change → merit re-seed) at the commit', async () => {
    const org = 'RollX5';
    const u = 'user-roll5';
    // season 2, steady; pending changes caps to 1/1/overflow.
    await putLeague(league(org, { current_season: 2, divisions: [{ name: 'D1', cap: 2 }, { name: 'D2', cap: 2 }, { name: 'D3', cap: 9 }], pending_structural: { divisions: [{ name: 'D1', cap: 1 }, { name: 'D2', cap: 1 }, { name: 'D3', cap: 9 }] } }));
    await ensureLeagueSeason(org, 2);
    await stampFinalFixtureEnd(org, 2, PAST);
    // Div1 a(9) b(5); Div2 c(9) d(5). Merit a,b,c,d into new caps 1/1/overflow.
    const rows: Array<[string, number, number]> = [['a', 1, 9], ['b', 1, 5], ['c', 2, 9], ['d', 2, 5]];
    for (const [id, division, points] of rows) { await putHorseForTest(u, id); await ensureStanding(st(org, { season: 2, division, stable_horse_id: id, user_id: u, points })); }
    const l = await getLeague(org) as League;
    expect(await rolloverDueLeague(l, AFTER)).toBe(true);
    const s3 = await listSeasonStandings(org, 3);
    expect(Object.fromEntries(s3.map(r => [r.stable_horse_id, r.division]))).toEqual({ a: 1, b: 2, c: 3, d: 3 });
    const after = await getLeague(org);
    expect(after?.current_season).toBe(3);
    expect(after?.divisions.map(d => d.cap)).toEqual([1, 1, 9]); // pending applied
    expect(after?.pending_structural).toBeUndefined();           // and cleared
  });

  it('season champion is the top-flight winner, not the global points leader', async () => {
    // Steady-state season 2. Points are per-division, so a Div 2 horse can out-point
    // the Div 1 winner — the champion must still be the Div 1 winner.
    const org = 'RollX6';
    const u = 'user-roll6';
    await putLeague(league(org, { current_season: 2 }));
    await ensureLeagueSeason(org, 2);
    await stampFinalFixtureEnd(org, 2, PAST);
    const rows: Array<[string, number, number]> = [
      ['champ', 1, 5], ['second', 1, 3],   // Div 1: champ wins with only 5 pts
      ['bigger', 2, 9], ['other', 2, 1],   // Div 2: 'bigger' has 9 pts (> champ) but is NOT champion
    ];
    for (const [id, division, points] of rows) { await putHorseForTest(u, id); await ensureStanding(st(org, { season: 2, division, stable_horse_id: id, user_id: u, points })); }
    expect(await rolloverDueLeague(await getLeague(org) as League, AFTER)).toBe(true);
    const res = await getSeasonResult(org, 2);
    expect(res?.champion?.stable_horse_id).toBe('champ'); // Div 1 winner, despite 'bigger' having more points
    expect(res?.champion?.points).toBe(5);
  });

  it('awards each horse its season prize once when the anti-farm gate is cleared', async () => {
    const org = 'RollX7';
    const u = 'user-roll7';
    await putLeague(league(org));
    await ensureLeagueSeason(org, 1);
    await stampFinalFixtureEnd(org, 1, PAST);
    // 3 horses in the season-1 pool → gate full (leagueXpMultiplier(3) === 1).
    for (let i = 0; i < 3; i++) {
      await putHorseForTest(u, `h${i}`);
      await ensureStanding(st(org, { division: 3, stable_horse_id: `h${i}`, user_id: u, points: 30 - i * 10 }));
    }
    expect(await rolloverDueLeague(await getLeague(org) as League, AFTER)).toBe(true);
    // rank-1 'h0' in a field of 3, promoted out of the pool: placement(1,3)=1000, +50 = 1050.
    expect((await getStableHorse(u, 'h0'))?.xp).toBe(1050);
  });

  it('does not re-mint prizes for standings already marked prize_awarded (crash-retry safety)', async () => {
    const org = 'RollX8';
    const u = 'user-roll8';
    await putLeague(league(org));
    await ensureLeagueSeason(org, 1);
    await stampFinalFixtureEnd(org, 1, PAST);
    const ids = ['a', 'b', 'c']; // 3 → gate would be full, so any award would be non-zero
    for (let i = 0; i < ids.length; i++) {
      await putHorseForTest(u, ids[i]!);
      await ensureStanding(st(org, { division: 3, stable_horse_id: ids[i]!, user_id: u, points: 30 - i * 10 }));
    }
    // Simulate a prior run that crashed after marking (and awarding) but before commit:
    // the rows are already marked prize_awarded.
    for (const id of ids) await tryMarkPrizeAwarded(org, 1, 3, id);
    expect(await rolloverDueLeague(await getLeague(org) as League, AFTER)).toBe(true);
    // Because the marks were already set, this run must NOT award again → xp stays 0.
    for (const id of ids) expect((await getStableHorse(u, id))?.xp).toBe(0);
    // and it still completes the rollover (season bumped, next season seeded).
    expect((await getLeague(org))?.current_season).toBe(2);
    expect((await listSeasonStandings(org, 2)).length).toBe(3);
  });
});

describe('rolloverDueLeague season-ended webhook', () => {
  it('emits a league.season.ended webhook on rollover', async () => {
    const owner = await makeUser('RollWhOwn');
    const orgName = 'RollWhOrg';
    await createOrgHandler({
      version: '2.0', routeKey: 'POST /organisations', rawPath: '/organisations', rawQueryString: '',
      headers: { 'content-type': 'application/json', 'x-cli-version': CURRENT_CLI_VERSION, 'x-user-id': owner.user_id, 'x-user-token': owner.secret_token },
      requestContext: {} as any, body: JSON.stringify({ name: orgName }), isBase64Encoded: false,
    } as any);
    const org = await getOrganisationByName(orgName);
    const org_id = org!.org_id;

    const calls: { body: string; headers: Record<string, string> }[] = [];
    const server: Server = await new Promise(resolve => {
      const s = createServer((req, res) => {
        let b = ''; req.on('data', c => { b += c; });
        req.on('end', () => { calls.push({ body: b, headers: req.headers as any }); res.statusCode = 200; res.end(); });
      });
      s.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = (server.address() as AddressInfo).port;
    await setOrgWebhook(org_id, `http://127.0.0.1:${port}/h`, 'rollwh');

    await putLeague(league(org_id, { current_season: 1, creator_user_id: owner.user_id }));
    await ensureLeagueSeason(org_id, 1);
    await stampFinalFixtureEnd(org_id, 1, PAST);
    // 3 horses in the season-1 pool (division 3): points 30 / 20 / 10.
    const seeds: Array<[string, number]> = [['a', 30], ['b', 20], ['c', 10]];
    for (const [id, pts] of seeds) { await putHorseForTest(owner.user_id, id); await ensureStanding(st(org_id, { division: 3, stable_horse_id: id, user_id: owner.user_id, points: pts })); }

    calls.length = 0;
    expect(await rolloverDueLeague(await getLeague(org_id) as League, AFTER)).toBe(true);
    await new Promise(r => setTimeout(r, 50));

    const evt = calls.filter(c => c.headers['x-token-derby-event'] === 'league.season.ended');
    expect(evt).toHaveLength(1);
    const payload = JSON.parse(evt[0]!.body);
    expect(payload.event).toBe('league.season.ended');
    expect(payload.league).toMatchObject({ season: 1, next_season: 2 });
    expect(payload.league.champion.stable_horse_id).toBe('a');          // pool winner
    expect(payload.league.standings.divisions).toHaveLength(3);
    // caps 2/2/overflow → pool winner 'a' seeded into division 1 → promoted 3→1
    expect(payload.league.promoted.some((m: any) => m.stable_horse_id === 'a' && m.from_division === 3 && m.to_division === 1)).toBe(true);

    await new Promise(r => server.close(() => r(null)));
  });
});
