import type { SeasonStandings } from '@token-derby/shared';
import { type DivisionRunner, divisionResults, seasonView } from './league';

const C = { body: '#111111', mane: '#222222', tail: '#222222', saddle: '#333333' };
const runner = (name: string, division: number, tokens: number, joinedAt = 0): DivisionRunner => ({
  id: `h-${name}`, stableId: `s-${name}`, name, owner: `o-${name}`, colors: C, hat: null, tokens, joinedAt, division,
});
const FIELD = [
  runner('Comet', 1, 4820), runner('Bolt', 1, 4310), runner('Dash', 1, 3120), runner('Ada', 1, 1980),
  runner('Oak', 2, 4550), runner('Newbie', 2, 3400), runner('Fern', 2, 2600), runner('Gale', 2, 900),
];
const NAMES = ['Premier', 'Championship'];

// Post-race standings: this race's points are already in.
const row = (rank: number, name: string, points: number, season_tokens: number, zone: 'promote' | 'relegate' | null = null) =>
  ({ rank, stable_horse_id: `s-${name}`, horse_name: name, user_name: `o-${name}`, points, season_tokens, zone });
const standings = (round: number, total = 8): SeasonStandings => ({
  org_name: 'Org', season: 2, round, races_per_season: total,
  divisions: [
    { division: 1, name: 'Premier', rows: [
      row(1, 'Bolt', 39, 94310), row(2, 'Comet', 30, 64820), row(3, 'Ada', 28, 73980), row(4, 'Dash', 18, 43120, 'relegate'),
    ] },
    { division: 2, name: 'Championship', rows: [
      row(1, 'Oak', 35, 59550, 'promote'), row(2, 'Fern', 21, 43600), row(3, 'Newbie', 15, 3400), row(4, 'Gale', 14, 20900),
    ] },
  ],
});

describe('divisionResults', () => {
  it('ranks each division by tokens and awards league points', () => {
    const [premier, champ] = divisionResults(FIELD, NAMES);
    expect(premier!.name).toBe('Premier');
    expect(premier!.rows.map((r) => [r.name, r.place, r.points])).toEqual([
      ['Comet', 1, 20], ['Bolt', 2, 15], ['Dash', 3, 12], ['Ada', 4, 10],
    ]);
    expect(champ!.rows.map((r) => r.name)).toEqual(['Oak', 'Newbie', 'Fern', 'Gale']);
  });

  it('breaks a token tie by who joined first, as the server does', () => {
    const [div] = divisionResults([runner('Late', 1, 500, 20), runner('Early', 1, 500, 10)], ['Premier']);
    expect(div!.rows.map((r) => r.name)).toEqual(['Early', 'Late']);
  });

  it('leaves out runners with no division', () => {
    const out = divisionResults([runner('Lost', -1, 900), runner('Comet', 1, 100)], ['Premier']);
    expect(out).toHaveLength(1);
    expect(out[0]!.rows.map((r) => r.name)).toEqual(['Comet']);
  });

  it('orders divisions top flight first, named from the race', () => {
    const out = divisionResults([runner('B', 2, 1), runner('A', 1, 1)], ['Premier', 'Championship']);
    expect(out.map((d) => d.name)).toEqual(['Premier', 'Championship']);
  });
});

describe('seasonView', () => {
  const results = divisionResults(FIELD, NAMES);

  it('marks movement against the table before this race', () => {
    const view = seasonView(standings(3), results, 3);
    const premier = view.divisions[0]!.rows;
    expect(premier.map((r) => [r.name, r.points, r.gain, r.movement])).toEqual([
      ['Bolt', 39, 15, null], ['Comet', 30, 20, 1], ['Ada', 28, 10, -1], ['Dash', 18, 12, null],
    ]);
    expect(premier[3]!.zone).toBe('relegate');
    expect(view.divisions[1]!.rows[0]!.zone).toBe('promote');
  });

  it('flags a horse whose only race this season is this one as new', () => {
    const champ = seasonView(standings(3), results, 3).divisions[1]!.rows;
    expect(champ.find((r) => r.name === 'Newbie')!.movement).toBe('new');
    expect(champ.find((r) => r.name === 'Gale')!.movement).toBe(-1);
  });

  it('flags nobody as new in round 1', () => {
    const first: SeasonStandings = { ...standings(1), divisions: [{ division: 1, name: 'Premier', rows: [row(1, 'Comet', 20, 4820), row(2, 'Bolt', 15, 4310)] }] };
    const rows = seasonView(first, divisionResults(FIELD.slice(0, 2), ['Premier']), 1).divisions[0]!.rows;
    expect(rows.map((r) => r.movement)).toEqual([null, null]);
  });

  it('gives a horse that did not run a gain of zero', () => {
    const extra: SeasonStandings = { ...standings(3), divisions: [{ division: 1, name: 'Premier', rows: [row(1, 'Absent', 50, 99999)] }] };
    const r = seasonView(extra, results, 3).divisions[0]!.rows[0]!;
    expect([r.gain, r.movement, r.colors]).toEqual([0, null, null]);
  });

  it('crowns the top flight leader on the last round only', () => {
    expect(seasonView(standings(3), results, 3).champion).toBeNull();
    expect(seasonView(standings(8), results, 8).champion).toEqual({ name: 'Bolt', owner: 'o-Bolt', division: 'Premier' });
  });

  it('carries the season, round and total', () => {
    const v = seasonView(standings(3), results, 3);
    expect([v.season, v.round, v.total]).toEqual([2, 3, 8]);
  });
});
