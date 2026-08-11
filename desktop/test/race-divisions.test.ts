import { describe, it, expect } from 'vitest';
import type { HorseColors, HorseView, RaceView } from '@token-derby/shared';
import { divisionOf, divisionFilters, applyDivisionFilter } from '../src/screens/race-divisions.js';
import { mapStandings, type Standing } from '../src/screens/race-standings.js';

const COLORS: HorseColors = { body: '#8B4513', mane: '#f5e9d3', tail: '#f5e9d3', saddle: '#3d2856' };

const NAMES = ['Premier', 'Championship', 'League One'];

function horse(overrides: Partial<HorseView> = {}): HorseView {
  return {
    horse_id: 'h-1',
    stable_horse_id: 'sh-1',
    rank: 1,
    name: 'Thunder',
    colors: COLORS,
    current_tokens: 100,
    last_heartbeat: '2026-08-11T12:00:00.000Z',
    joined_at: '2026-08-11T11:00:00.000Z',
    user_id: 'u-1',
    user_name: 'Me',
    xp: 0,
    ...overrides,
  } as HorseView;
}

function race(overrides: Partial<RaceView> = {}): RaceView {
  return {
    race_id: 'race-1',
    name: 'Fixture',
    start_time: '2026-08-11T11:00:00.000Z',
    end_time: '2026-08-11T13:00:00.000Z',
    tz: 'UTC',
    max_participants: 12,
    join_code: 'ABC123',
    created_at: '2026-08-11T11:00:00.000Z',
    status: 'live',
    horses: [],
    server_time: '2026-08-11T12:00:00.000Z',
    time_left_seconds: 3600,
    ...overrides,
  } as RaceView;
}

function fixture(overrides: Partial<RaceView> = {}): RaceView {
  return race({ league_id: 'org-1', league_division_names: NAMES, ...overrides });
}

describe('divisionOf', () => {
  it('is null when the race is not a league fixture', () => {
    expect(divisionOf(race(), horse({ division: 2 }))).toBeNull();
  });

  it('uses the horse division the server assigned', () => {
    expect(divisionOf(fixture(), horse({ division: 2 }))).toBe(2);
  });

  // Matches site/src/render/ticker.ts and projectedGains, which mirror
  // score-league-race: an unscored entrant is scored in the bottom division.
  it('places an unscored entrant in the bottom division', () => {
    expect(divisionOf(fixture(), horse({ division: undefined }))).toBe(NAMES.length);
  });
});

describe('divisionFilters', () => {
  it('offers nothing for a standard race', () => {
    expect(divisionFilters(race())).toEqual([]);
  });

  it('offers nothing when a league fixture has no division names', () => {
    expect(divisionFilters(race({ league_id: 'org-1' }))).toEqual([]);
  });

  it('offers All plus each division in top-to-bottom order', () => {
    expect(divisionFilters(fixture())).toEqual([
      { value: null, label: 'All' },
      { value: 1, label: 'Premier' },
      { value: 2, label: 'Championship' },
      { value: 3, label: 'League One' },
    ]);
  });
});

describe('applyDivisionFilter', () => {
  const standings: Standing[] = [
    { rank: 1, horse_id: 'a', name: 'A', tokens: 900, colors: COLORS, isYou: false, isLeader: true, division: 1 },
    { rank: 2, horse_id: 'b', name: 'B', tokens: 800, colors: COLORS, isYou: false, isLeader: false, division: 2 },
    { rank: 3, horse_id: 'c', name: 'C', tokens: 700, colors: COLORS, isYou: true, isLeader: false, division: 1 },
    { rank: 4, horse_id: 'd', name: 'D', tokens: 600, colors: COLORS, isYou: false, isLeader: false, division: 2 },
  ];

  it('leaves the list untouched when no division is selected', () => {
    expect(applyDivisionFilter(standings, null)).toEqual(standings);
  });

  it('keeps only the selected division', () => {
    expect(applyDivisionFilter(standings, 2).map((s) => s.horse_id)).toEqual(['b', 'd']);
  });

  // League points come from position within the division, so the visible rank has
  // to be the division rank, not the global one.
  it('renumbers rank from 1 within the division, preserving order', () => {
    expect(applyDivisionFilter(standings, 2).map((s) => s.rank)).toEqual([1, 2]);
    expect(applyDivisionFilter(standings, 1).map((s) => [s.horse_id, s.rank])).toEqual([
      ['a', 1],
      ['c', 2],
    ]);
  });

  it('carries the other row fields through unchanged', () => {
    const [, second] = applyDivisionFilter(standings, 1);
    expect(second).toMatchObject({ horse_id: 'c', name: 'C', tokens: 700, isYou: true });
  });

  it('returns nothing for a division with no horses', () => {
    expect(applyDivisionFilter(standings, 3)).toEqual([]);
  });
});

describe('mapStandings division', () => {
  it('is null for a standard race', () => {
    const h = horse({ rank: 1 });
    expect(mapStandings(race({ horses: [h] }), new Set())[0].division).toBeNull();
  });

  it('carries the division on a league fixture', () => {
    const h = horse({ rank: 1, division: 2 });
    expect(mapStandings(fixture({ horses: [h] }), new Set())[0].division).toBe(2);
  });

  it('carries the bottom division for an unscored entrant', () => {
    const h = horse({ rank: 1, division: undefined });
    expect(mapStandings(fixture({ horses: [h] }), new Set())[0].division).toBe(NAMES.length);
  });
});
