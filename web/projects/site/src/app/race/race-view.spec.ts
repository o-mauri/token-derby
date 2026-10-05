import type { GetRaceResponse, HorseView, SeasonStandings } from '@token-derby/shared';
import { RaceTickerComposer, countdownAnchor, finishViews, laneState, raceLanes } from './race-view';

const T0 = '2026-04-22T09:00:00Z';
const T1 = '2026-04-22T17:00:00Z';
const MID = new Date('2026-04-22T13:00:00Z');

function horse(id: string, over: Partial<HorseView> = {}): HorseView {
  return {
    horse_id: id, stable_horse_id: `s-${id}`, name: `Horse ${id}`, user_name: `user-${id}`,
    colors: { body: '#111111', mane: '#222222', tail: '#222222', saddle: '#333333' },
    current_tokens: 100, last_heartbeat: T0, joined_at: T0, rank: 1, xp: 0, ...over,
  } as HorseView;
}

function race(horses: HorseView[], over: Partial<GetRaceResponse> = {}): GetRaceResponse {
  return {
    race_id: 'r', name: 'Friday Derby', join_code: 'ABC123', start_time: T0, end_time: T1, status: 'live',
    server_time: T0, time_left_seconds: 3600, horses, ...over,
  } as GetRaceResponse;
}

describe('raceLanes', () => {
  it('keeps lanes in join order, whatever the ranking', () => {
    const r = race([horse('b', { joined_at: '2026-04-22T09:05:00Z' }), horse('a', { joined_at: '2026-04-22T09:01:00Z' })]);
    expect(raceLanes(r, MID).lanes.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('positions horses by scored tokens: the leader at the elapsed share, others in proportion', () => {
    const r = race([horse('a', { current_tokens: 900, scored_tokens: 800 }), horse('b', { current_tokens: 400 })]);
    const { progressById } = raceLanes(r, MID);
    expect(progressById['a']).toBe(50);
    expect(progressById['b']).toBe(25);
  });

  it('shows scored tokens and ranks by them, ties sharing a place', () => {
    const r = race([horse('a', { current_tokens: 900, scored_tokens: 500 }), horse('b', { current_tokens: 500 }), horse('c', { current_tokens: 600 })]);
    const lanes = raceLanes(r, MID).lanes;
    expect(lanes.map((l) => [l.id, l.tokens, l.position])).toEqual([['a', 500, 2], ['b', 500, 2], ['c', 600, 1]]);
  });

  it('prefers the final scored total once the race has one', () => {
    const lanes = raceLanes(race([horse('a', { current_tokens: 900, final_scored_tokens: 850 })], { status: 'finished' }), MID).lanes;
    expect(lanes[0]!.tokens).toBe(850);
  });

  it('derives the level from banked plus live XP, and the owner and hat from the horse', () => {
    const lane = raceLanes(race([horse('a', { xp: 40, live_xp: 30, equipped_hat: { id: 'stetson', variant: 2, obtained_at: T0 } })]), MID).lanes[0]!;
    expect(lane.level).toBe(2);
    expect(lane.owner).toBe('user-a');
    expect(lane.hat).toEqual({ id: 'stetson', variant: 2 });
  });

  it('carries the server pace, or none', () => {
    const lanes = raceLanes(race([horse('a', { pace_15m: 1234 }), horse('b')]), MID).lanes;
    expect(lanes.map((l) => l.pace)).toEqual([1234, null]);
  });

  it('gives league lanes their place within their own division', () => {
    const r = race(
      [horse('a', { division: 1, current_tokens: 300 }), horse('b', { division: 2, current_tokens: 900 }), horse('c', { division: 2, current_tokens: 200 })],
      { league_id: 'org', league_division_names: ['Premier', 'Championship'] },
    );
    expect(raceLanes(r, MID).lanes.map((l) => l.league)).toEqual([
      { rank: 1, division: 'Premier' }, { rank: 1, division: 'Championship' }, { rank: 2, division: 'Championship' },
    ]);
    expect(raceLanes(race([horse('a')]), MID).lanes[0]!.league).toBeNull();
  });

  it("shows stamina, banded by the race's own taper floor, only when the race runs it", () => {
    const tired = (level: number) => horse('a', { modifier_states: { stamina: { level } } } as Partial<HorseView>);
    const withStamina = (h: HorseView, floor = 20) => race([h], { modifiers: { stamina: { enabled: true, params: { taper_floor: floor } } } } as Partial<GetRaceResponse>);
    expect(raceLanes(withStamina(tired(80)), MID).lanes[0]!.stamina).toEqual({ value: 80, band: 'high' });
    expect(raceLanes(withStamina(tired(30)), MID).lanes[0]!.stamina!.band).toBe('mid');
    expect(raceLanes(withStamina(tired(30), 40), MID).lanes[0]!.stamina!.band).toBe('low');
    expect(raceLanes(race([tired(30)]), MID).lanes[0]!.stamina).toBeNull();
  });
});

describe('laneState and countdownAnchor', () => {
  it('maps race status onto lane state', () => {
    expect(['pending', 'live', 'finished'].map((s) => laneState(race([], { status: s as never })))).toEqual(['pending', 'live', 'finished']);
  });

  it('anchors the countdown to when the snapshot arrived', () => {
    expect(countdownAnchor(race([], { time_left_seconds: 90 }), 5000)).toEqual({ atMs: 5000, timeLeftSeconds: 90 });
  });
});

describe('finishViews', () => {
  it('orders by final rank, with tokens behind the winner and the XP awarded', () => {
    const r = race(
      [horse('b', { rank: 2, final_scored_tokens: 700, xp: 60, xp_awarded: 20 }), horse('a', { rank: 1, final_scored_tokens: 1000, xp: 140, xp_awarded: 40 })],
      { status: 'finished' },
    );
    expect(finishViews(r).map((v) => [v.id, v.position, v.tokens, v.behind, v.xpBefore, v.xpAwarded])).toEqual([
      ['a', 1, 1000, null, 140, 40], ['b', 2, 700, 300, 60, 20],
    ]);
  });
});

describe('RaceTickerComposer', () => {
  const ev = (at: number, name = 'Stampede!') => ({ at, name, xp: 50, kind: 'stampede', tokens: 10000 }) as never;

  it('shows the live order and nothing once the race is not live', () => {
    const c = new RaceTickerComposer();
    expect(c.update(race([horse('a', { current_tokens: 900 }), horse('b', { current_tokens: 400, rank: 2 })])).filter((x) => x.kind === 'order').length).toBe(2);
    expect(c.update(race([horse('a')], { status: 'finished' }))).toEqual([]);
  });

  it('adds fresh achievements once, and keeps showing them on polls with nothing new', () => {
    const c = new RaceTickerComposer();
    const first = c.update(race([horse('a', { recent_events: [ev(1)] })]));
    expect(first.filter((x) => x.kind === 'achievement').length).toBe(1);
    const again = c.update(race([horse('a', { recent_events: [ev(1)] })]));
    expect(again.filter((x) => x.kind === 'achievement').length).toBe(1);
    const more = c.update(race([horse('a', { recent_events: [ev(1), ev(2, 'Pulled Away!')] })]));
    const names = more.filter((x) => x.kind === 'achievement').map((x) => (x as { item: { name: string } }).item.name);
    expect(names).toEqual(['Pulled Away!']);
  });

  it('asks for league standings once per league race and folds them in after the order', () => {
    const c = new RaceTickerComposer();
    const league = race([horse('a', { division: 1 })], { league_id: 'org', organisation_name: 'Acme', league_season: 2, league_division_names: ['Premier'] });
    expect(c.standingsWanted(league)).toEqual({ org: 'Acme', season: 2 });
    c.standingsRequested();
    expect(c.standingsWanted(league)).toBeNull();
    const standings: SeasonStandings = { org_name: 'Acme', season: 2, round: 3, races_per_season: 8, divisions: [
      { division: 1, name: 'Premier', rows: [{ rank: 1, stable_horse_id: 's-a', horse_name: 'Horse a', user_name: 'U', points: 10, season_tokens: 5, zone: null }] },
    ] } as SeasonStandings;
    c.standingsLoaded(standings);
    const cells = c.update(league);
    expect(cells.some((x) => x.kind === 'standing')).toBe(true);
    expect(cells.findIndex((x) => x.kind === 'standing')).toBeGreaterThan(cells.findIndex((x) => x.kind === 'order'));
  });

  it('lets a failed standings load be retried on a later poll', () => {
    const c = new RaceTickerComposer();
    const league = race([horse('a')], { league_id: 'org', organisation_name: 'Acme', league_season: 2, league_division_names: ['Premier'] });
    c.standingsRequested();
    c.standingsFailed();
    expect(c.standingsWanted(league)).toEqual({ org: 'Acme', season: 2 });
    expect(c.standingsWanted(race([horse('a')]))).toBeNull();
  });
});
