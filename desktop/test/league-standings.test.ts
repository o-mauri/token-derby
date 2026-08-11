import { describe, it, expect } from 'vitest';
import type { SeasonStandings, StandingRow } from '@token-derby/shared';
import { mapLeagueStandings, seasonLabel } from '../src/screens/league-standings.js';

function row(overrides: Partial<StandingRow> = {}): StandingRow {
  return {
    rank: 1,
    stable_horse_id: 'sh-1',
    horse_name: 'Thunder',
    user_name: 'Me',
    points: 12,
    season_tokens: 1_204_338,
    zone: null,
    ...overrides,
  };
}

function standings(overrides: Partial<SeasonStandings> = {}): SeasonStandings {
  return {
    org_name: 'Acme',
    season: 3,
    round: 4,
    races_per_season: 8,
    divisions: [],
    ...overrides,
  };
}

describe('seasonLabel', () => {
  // `round` is fixtures_materialised, which counts a live fixture — so this reads
  // as scheduling, never as "rounds completed".
  it('reads as scheduling, not completion', () => {
    expect(seasonLabel(standings())).toBe('Season 3 · Round 4 of 8');
  });
});

describe('mapLeagueStandings', () => {
  const withDivisions = standings({
    divisions: [
      { division: 1, name: 'Premier Division', rows: [row({ rank: 1, stable_horse_id: 'sh-a', horse_name: 'A' })] },
      {
        division: 2,
        name: 'Token Munchers',
        rows: [
          row({ rank: 1, stable_horse_id: 'sh-b', horse_name: 'B', zone: 'promote' }),
          row({ rank: 2, stable_horse_id: 'sh-mine', horse_name: 'Mine' }),
          row({ rank: 3, stable_horse_id: 'sh-c', horse_name: 'C', zone: 'relegate' }),
        ],
      },
      { division: 3, name: 'Claude Casuals', rows: [] },
    ],
  });

  it('keeps divisions in top-flight-first order', () => {
    expect(mapLeagueStandings(withDivisions, new Set()).map((d) => d.name)).toEqual([
      'Premier Division',
      'Token Munchers',
      'Claude Casuals',
    ]);
  });

  it('flags the jockey’s own horses by stable_horse_id', () => {
    const groups = mapLeagueStandings(withDivisions, new Set(['sh-mine']));
    const div2 = groups[1]!;
    expect(div2.rows.map((r) => r.isYou)).toEqual([false, true, false]);
  });

  it('maps the promotion zone to a good tone and relegation to bad', () => {
    const div2 = mapLeagueStandings(withDivisions, new Set())[1]!;
    expect(div2.rows.map((r) => r.tone)).toEqual(['good', undefined, 'bad']);
  });

  it('carries rank, name, points and season tokens through', () => {
    const first = mapLeagueStandings(withDivisions, new Set())[0]!.rows[0]!;
    expect(first).toMatchObject({
      rank: 1,
      horseName: 'A',
      points: 12,
      seasonTokens: 1_204_338,
    });
  });

  it('keeps a division with no horses so the flight is still visible', () => {
    const empty = mapLeagueStandings(withDivisions, new Set())[2]!;
    expect(empty.name).toBe('Claude Casuals');
    expect(empty.rows).toEqual([]);
  });

  it('returns nothing when the league has no divisions at all', () => {
    expect(mapLeagueStandings(standings(), new Set())).toEqual([]);
  });
});
