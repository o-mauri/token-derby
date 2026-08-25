import { describe, it, expect } from 'vitest';
import { rolloverDueLeague } from '../../src/lib/rollover-league.js';
import { putLeague, getLeague } from '../../src/db/leagues.js';
import { ensureLeagueSeason, getLeagueSeason, stampFinalFixtureEnd } from '../../src/db/league-seasons.js';
import { ensureStanding, listSeasonStandings, tryMarkPrizeAwarded, addStandingPointsForRound } from '../../src/db/league-standings.js';
import { getSeasonResult } from '../../src/db/league-results.js';
import { getStableHorse } from '../../src/db/stable.js';
import { setOrgWebhook, getOrganisationByName, addMember } from '../../src/db/organisations.js';
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

// Rollover only seeds horses whose owner is still an org member. These tests
// write standings straight to the table, so the owner has to be enrolled too.
async function member(org_id: string, user_id: string): Promise<void> {
  await addMember(org_id, user_id, '2026-07-01T00:00:00.000Z');
}

// Rollover only seeds bottom-division horses that actually raced. Records
// round 1 as scored with zero points/tokens, so seeded totals are unchanged.
async function raced(org_id: string, season: number, division: number, stable_horse_id: string): Promise<void> {
  await addStandingPointsForRound(org_id, season, division, stable_horse_id, 0, 0, 1);
}

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
    await member(org, u);
    for (let i = 0; i < ids.length; i++) {
      await putHorseForTest(u, ids[i]!);
      await ensureStanding(st(org, { division: 3, stable_horse_id: ids[i]!, horse_name: ids[i]!, user_id: u, points: 50 - i * 10, season_tokens: 1000 - i }));
      await raced(org, 1, 3, ids[i]!);
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
    await member(org, u);
    await putHorseForTest(u, 'a');
    await ensureStanding(st(org, { division: 3, stable_horse_id: 'a', user_id: u, points: 10, season_tokens: 5 }));
    await raced(org, 1, 3, 'a');
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
    await member(org, u);
    for (const [id, division, points] of rows) { await putHorseForTest(u, id); await ensureStanding(st(org, { season: 2, division, stable_horse_id: id, user_id: u, points })); await raced(org, 2, division, id); }
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
    await member(org, u);
    for (const [id, division, points] of rows) { await putHorseForTest(u, id); await ensureStanding(st(org, { season: 2, division, stable_horse_id: id, user_id: u, points })); await raced(org, 2, division, id); }
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
    await member(org, u);
    for (let i = 0; i < 3; i++) {
      await putHorseForTest(u, `h${i}`);
      await ensureStanding(st(org, { division: 3, stable_horse_id: `h${i}`, user_id: u, points: 30 - i * 10 }));
      await raced(org, 1, 3, `h${i}`);
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
    await member(org, u);
    for (let i = 0; i < ids.length; i++) {
      await putHorseForTest(u, ids[i]!);
      await ensureStanding(st(org, { division: 3, stable_horse_id: ids[i]!, user_id: u, points: 30 - i * 10 }));
      await raced(org, 1, 3, ids[i]!);
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
    for (const [id, pts] of seeds) { await putHorseForTest(owner.user_id, id); await ensureStanding(st(org_id, { division: 3, stable_horse_id: id, user_id: owner.user_id, points: pts })); await raced(org_id, 1, 3, id); }

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

// Rollover seeds the next season from the standings of the one that just ended.
// Two rows must not be carried forward: a horse whose owner is no longer an org
// member (scoreLeagueRace already refuses to score it, so seeding it would
// re-create the ghost every season) and a horse that raced in no fixtures while
// sitting in the bottom division. Both culls live in the seeding loop only —
// prizes, the anti-farm gate and the season-ended payload see the full
// standings, because those describe a season that has already happened.
describe('rolloverDueLeague culls ghosts and idle bottom-division horses from the seed', () => {
  it('does not seed a removed member horse into the next season', async () => {
    const org = 'RollCull1';
    const uReal = 'user-cull1-real';
    const uGhost = 'user-cull1-ghost'; // removed from the org: never a MEMBER# row
    await putLeague(league(org));
    await ensureLeagueSeason(org, 1);
    await stampFinalFixtureEnd(org, 1, PAST);
    await member(org, uReal);
    // All three raced, so only the membership filter can cull the ghost.
    const seeds: Array<[string, string, number]> = [[uReal, 'r1', 30], [uReal, 'r2', 20], [uGhost, 'ghost', 10]];
    for (const [uid, id, points] of seeds) {
      await putHorseForTest(uid, id);
      await ensureStanding(st(org, { division: 3, stable_horse_id: id, user_id: uid, points }));
      await raced(org, 1, 3, id);
    }

    expect(await rolloverDueLeague(await getLeague(org) as League, AFTER)).toBe(true);

    const seeded = (await listSeasonStandings(org, 2)).map(r => r.stable_horse_id).sort();
    expect(seeded).toEqual(['r1', 'r2']);
    // The season-1 row is history and stays put — only the seed is culled.
    expect((await listSeasonStandings(org, 1)).map(r => r.stable_horse_id).sort()).toEqual(['ghost', 'r1', 'r2']);
  });

  it('does not seed an idle bottom-division horse', async () => {
    const org = 'RollCull2';
    const u = 'user-cull2';
    await putLeague(league(org)); // divisions 3 → bottom division is 3
    await ensureLeagueSeason(org, 1);
    await stampFinalFixtureEnd(org, 1, PAST);
    await member(org, u);
    for (const [id, points] of [['racer', 20], ['racer2', 10]] as Array<[string, number]>) {
      await putHorseForTest(u, id);
      await ensureStanding(st(org, { division: 3, stable_horse_id: id, user_id: u, points }));
      await raced(org, 1, 3, id);
    }
    // Seeded into the bottom division but never routed through
    // addStandingPointsForRound → scored_rounds stays empty.
    await putHorseForTest(u, 'idle');
    await ensureStanding(st(org, { division: 3, stable_horse_id: 'idle', user_id: u, points: 0 }));

    expect(await rolloverDueLeague(await getLeague(org) as League, AFTER)).toBe(true);

    const seeded = (await listSeasonStandings(org, 2)).map(r => r.stable_horse_id).sort();
    expect(seeded).toEqual(['racer', 'racer2']);
    expect(seeded).not.toContain('idle');
  });

  it('DOES seed an idle horse in a higher division', async () => {
    // The grace period: relegation happens on points, culling waits a season.
    // 'idleTop' raced nothing but sat in division 1, so it is relegated to
    // division 2 for next season rather than dropped. It only becomes cullable
    // at the following rollover, once it has reached the bottom division.
    const org = 'RollCull3';
    const u = 'user-cull3';
    await putLeague(league(org, { current_season: 2 })); // steady state, boundaries [1, 1]
    await ensureLeagueSeason(org, 2);
    await stampFinalFixtureEnd(org, 2, PAST);
    await member(org, u);
    const racers: Array<[string, number, number]> = [['top', 1, 10], ['mid', 2, 10], ['mid2', 2, 4], ['low', 3, 10]];
    for (const [id, division, points] of racers) {
      await putHorseForTest(u, id);
      await ensureStanding(st(org, { season: 2, division, stable_horse_id: id, user_id: u, points }));
      await raced(org, 2, division, id);
    }
    // Two idle horses, neither routed through addStandingPointsForRound.
    // 'idleTop' sat in division 1 and lands in 2. 'idleMid' sat in division 2
    // and is relegated INTO the bottom division — the case that pins the check
    // to the division sat in, not the computed next one: reading nextDivision
    // here would cull 'idleMid' a season early.
    for (const id of ['idleTop', 'idleMid']) await putHorseForTest(u, id);
    await ensureStanding(st(org, { season: 2, division: 1, stable_horse_id: 'idleTop', user_id: u, points: 0 }));
    await ensureStanding(st(org, { season: 2, division: 2, stable_horse_id: 'idleMid', user_id: u, points: 0 }));

    expect(await rolloverDueLeague(await getLeague(org) as League, AFTER)).toBe(true);

    const s3 = await listSeasonStandings(org, 3);
    expect(Object.fromEntries(s3.map(r => [r.stable_horse_id, r.division])))
      .toEqual({ top: 1, mid: 1, idleTop: 2, mid2: 2, low: 2, idleMid: 3 });
  });

  it('DOES seed a bottom-division horse that raced and scored nothing', async () => {
    // points: 0 with a non-empty scored_rounds — the case a `points > 0` cull
    // would wrongly destroy. Last place can legitimately score nothing.
    const org = 'RollCull4';
    const u = 'user-cull4';
    await putLeague(league(org, { current_season: 2 }));
    await ensureLeagueSeason(org, 2);
    await stampFinalFixtureEnd(org, 2, PAST);
    await member(org, u);
    for (const [id, points] of [['other', 5], ['zeroButRaced', 0]] as Array<[string, number]>) {
      await putHorseForTest(u, id);
      await ensureStanding(st(org, { season: 2, division: 3, stable_horse_id: id, user_id: u, points }));
      await raced(org, 2, 3, id); // 0 points, 0 tokens, but round 1 is recorded as scored
    }
    const s2 = await listSeasonStandings(org, 2);
    expect(s2.find(r => r.stable_horse_id === 'zeroButRaced')).toMatchObject({ points: 0, season_tokens: 0 });

    expect(await rolloverDueLeague(await getLeague(org) as League, AFTER)).toBe(true);

    const s3 = await listSeasonStandings(org, 3);
    expect(Object.fromEntries(s3.map(r => [r.stable_horse_id, r.division])))
      .toEqual({ other: 2, zeroButRaced: 3 }); // 'other' promoted on points; the zero-scorer stays
  });

  it('leaves this season prizes and the season-ended payload untouched', async () => {
    // The cull is scoped to the seeding loop. Filtering `standings` at source
    // would retroactively rewrite a season that already happened: the anti-farm
    // gate would drop from leagueXpMultiplier(3)=1 to leagueXpMultiplier(2)=0.5
    // and the division field size from 3 to 2, so 'r1' would get 525 instead of
    // 1050 and 'r2' 63 instead of 324. It would also silently drop the ghost
    // from what league.season.ended subscribers receive.
    const owner = await makeUser('RollCullOwn');
    const ghostUser = await makeUser('RollCullGhost'); // never joins the org
    const orgName = 'RollCullOrg';
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
    await setOrgWebhook(org_id, `http://127.0.0.1:${port}/h`, 'rollcull');

    await putLeague(league(org_id, { current_season: 1, creator_user_id: owner.user_id }));
    await ensureLeagueSeason(org_id, 1);
    await stampFinalFixtureEnd(org_id, 1, PAST);
    const seeds: Array<[string, string, number]> = [
      [owner.user_id, 'r1', 30], [owner.user_id, 'r2', 20], [ghostUser.user_id, 'ghost', 10],
    ];
    for (const [uid, id, points] of seeds) {
      await putHorseForTest(uid, id);
      await ensureStanding(st(org_id, { division: 3, stable_horse_id: id, user_id: uid, points }));
      await raced(org_id, 1, 3, id);
    }

    calls.length = 0;
    expect(await rolloverDueLeague(await getLeague(org_id) as League, AFTER)).toBe(true);
    await new Promise(r => setTimeout(r, 50));

    // Prizes: gate 1, field size 3, all three promoted out of the season-1 pool.
    expect((await getStableHorse(owner.user_id, 'r1'))?.xp).toBe(1050); // placement 1000 + 50 promotion
    expect((await getStableHorse(owner.user_id, 'r2'))?.xp).toBe(324);  // placement 274 + 50
    expect((await getStableHorse(ghostUser.user_id, 'ghost'))?.xp).toBe(125); // 75 + 50, already earned
    // Season summary still records the ghost's promotion.
    expect((await getSeasonResult(org_id, 1))?.promoted).toContain('ghost');
    // Webhook payload still lists all three.
    const evt = calls.filter(c => c.headers['x-token-derby-event'] === 'league.season.ended');
    expect(evt).toHaveLength(1);
    const payload = JSON.parse(evt[0]!.body);
    const listed = payload.league.standings.divisions
      .flatMap((d: any) => d.rows.map((r: any) => r.stable_horse_id)).sort();
    expect(listed).toEqual(['ghost', 'r1', 'r2']);
    expect(payload.league.promoted.map((m: any) => m.stable_horse_id).sort()).toEqual(['ghost', 'r1', 'r2']);

    await new Promise(r => server.close(() => r(null)));
  });
});
