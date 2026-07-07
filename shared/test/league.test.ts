import { describe, it, expect } from 'vitest';
import { validateLeagueConfig, leagueFixtureName, linearLeaguePoints, buildSeasonStandings, type LeagueConfigInput } from '../src/league.js';
import type { LeagueStanding } from '../src/types.js';

const valid: LeagueConfigInput = {
  divisions: 3,
  racers_per_division: 10,
  races_per_season: 8,
  promote_relegate_count: 2,
  weekdays: [1, 2, 3, 4, 5],
  start_local: '09:00',
  end_local: '17:30',
  max_participants: 30,
};

describe('validateLeagueConfig', () => {
  it('accepts a well-formed config', () => {
    expect(validateLeagueConfig(valid)).toBeNull();
  });

  it('accepts a config without the optional max_participants', () => {
    const { max_participants: _omit, ...rest } = valid;
    expect(validateLeagueConfig(rest)).toBeNull();
  });

  it('rejects non-positive / non-integer divisions, caps, and season length', () => {
    expect(validateLeagueConfig({ ...valid, divisions: 0 })).toMatch(/divisions/);
    expect(validateLeagueConfig({ ...valid, racers_per_division: 1.5 })).toMatch(/racers_per_division/);
    expect(validateLeagueConfig({ ...valid, races_per_season: 0 })).toMatch(/races_per_season/);
  });

  it('rejects a negative promote_relegate_count and one not less than the cap', () => {
    expect(validateLeagueConfig({ ...valid, promote_relegate_count: -1 })).toMatch(/promote_relegate_count/);
    expect(validateLeagueConfig({ ...valid, promote_relegate_count: 10 })).toMatch(/less than racers_per_division/);
  });

  it('allows promote_relegate_count of 0', () => {
    expect(validateLeagueConfig({ ...valid, promote_relegate_count: 0 })).toBeNull();
  });

  it('rejects malformed weekdays', () => {
    expect(validateLeagueConfig({ ...valid, weekdays: [] })).toMatch(/weekdays/);
    expect(validateLeagueConfig({ ...valid, weekdays: [0, 8] })).toMatch(/weekdays/);
    expect(validateLeagueConfig({ ...valid, weekdays: 'mon' })).toMatch(/weekdays/);
  });

  it('rejects malformed times and end not after start', () => {
    expect(validateLeagueConfig({ ...valid, start_local: '9:00' })).toMatch(/start_local/);
    expect(validateLeagueConfig({ ...valid, end_local: '25:00' })).toMatch(/end_local/);
    expect(validateLeagueConfig({ ...valid, start_local: '17:30', end_local: '17:30' })).toMatch(/after start_local/);
  });

  it('rejects a non-positive max_participants when provided', () => {
    expect(validateLeagueConfig({ ...valid, max_participants: 0 })).toMatch(/max_participants/);
  });
});

describe('leagueFixtureName', () => {
  it('appends the round marker to the base name', () => {
    expect(leagueFixtureName('Anthropic League', 4, 8)).toBe('Anthropic League (League Race (4/8))');
  });
  it('works for the first and last rounds', () => {
    expect(leagueFixtureName('X', 1, 1)).toBe('X (League Race (1/1))');
    expect(leagueFixtureName('Y League', 10, 10)).toBe('Y League (League Race (10/10))');
  });
});

describe('linearLeaguePoints', () => {
  it('awards field-size points to 1st, descending to 1 for last', () => {
    expect(linearLeaguePoints(1, 8)).toBe(8);
    expect(linearLeaguePoints(2, 8)).toBe(7);
    expect(linearLeaguePoints(8, 8)).toBe(1);
  });
  it('is 1 for the only racer in a division of 1', () => {
    expect(linearLeaguePoints(1, 1)).toBe(1);
  });
});

function st(over: Partial<LeagueStanding>): LeagueStanding {
  return {
    org_id: 'o', season: 1, division: over.division ?? 1, stable_horse_id: over.stable_horse_id ?? 's',
    horse_name: over.horse_name ?? 'H', user_id: 'u', user_name: over.user_name ?? 'U',
    points: over.points ?? 0, season_tokens: over.season_tokens ?? 0, entered_at: over.entered_at ?? '2026-07-07T00:00:00Z',
  };
}

describe('buildSeasonStandings', () => {
  const common = { org_name: 'Org', divisions: 3, promote_relegate_count: 1, races_per_season: 8, season: 1, round: 3 };

  it('returns all divisions (top first), even empty ones', () => {
    const out = buildSeasonStandings({ ...common, standings: [st({ division: 3, stable_horse_id: 'a', points: 5 })] });
    expect(out.divisions.map(d => d.division)).toEqual([1, 2, 3]);
    expect(out.divisions[0]!.rows).toEqual([]);        // empty top flight (season 1)
    expect(out.divisions[2]!.rows).toHaveLength(1);    // bottom pool
    expect(out).toMatchObject({ org_name: 'Org', season: 1, round: 3, races_per_season: 8 });
  });

  it('ranks within a division by points, then season_tokens, then entered_at', () => {
    const out = buildSeasonStandings({ ...common, standings: [
      st({ division: 2, stable_horse_id: 'lo', points: 3 }),
      st({ division: 2, stable_horse_id: 'hi', points: 10 }),
      st({ division: 2, stable_horse_id: 'tieA', points: 3, season_tokens: 900 }),
      st({ division: 2, stable_horse_id: 'tieB', points: 3, season_tokens: 500 }),
    ] });
    const rows = out.divisions[1]!.rows;
    expect(rows.map(r => r.stable_horse_id)).toEqual(['hi', 'tieA', 'tieB', 'lo']);
    expect(rows.map(r => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it('flags promote/relegate zones, exempting top flight from promotion and bottom from relegation', () => {
    // promote_relegate_count 1. Division 2 (middle): top1 promote, bottom1 relegate.
    const mid = buildSeasonStandings({ ...common, standings: [
      st({ division: 2, stable_horse_id: 'top', points: 9 }),
      st({ division: 2, stable_horse_id: 'midr', points: 5 }),
      st({ division: 2, stable_horse_id: 'bot', points: 1 }),
    ] });
    const midRows = Object.fromEntries(mid.divisions[1]!.rows.map(r => [r.stable_horse_id, r.zone]));
    expect(midRows).toEqual({ top: 'promote', midr: null, bot: 'relegate' });

    // Division 1 (top flight): NO promote zone; only relegation at the bottom.
    const top = buildSeasonStandings({ ...common, standings: [
      st({ division: 1, stable_horse_id: 'champ', points: 9 }),
      st({ division: 1, stable_horse_id: 'drop', points: 1 }),
    ] });
    expect(Object.fromEntries(top.divisions[0]!.rows.map(r => [r.stable_horse_id, r.zone]))).toEqual({ champ: null, drop: 'relegate' });

    // Bottom division (3): NO relegate zone; only promotion at the top.
    const bot = buildSeasonStandings({ ...common, standings: [
      st({ division: 3, stable_horse_id: 'rise', points: 9 }),
      st({ division: 3, stable_horse_id: 'last', points: 1 }),
    ] });
    expect(Object.fromEntries(bot.divisions[2]!.rows.map(r => [r.stable_horse_id, r.zone]))).toEqual({ rise: 'promote', last: null });
  });

  it('clamps zones so they never overlap in a small division', () => {
    // promote_relegate_count 2 but only 3 rows in a middle division → effective 1 each.
    const out = buildSeasonStandings({ ...common, promote_relegate_count: 2, standings: [
      st({ division: 2, stable_horse_id: 'a', points: 9 }),
      st({ division: 2, stable_horse_id: 'b', points: 5 }),
      st({ division: 2, stable_horse_id: 'c', points: 1 }),
    ] });
    expect(Object.fromEntries(out.divisions[1]!.rows.map(r => [r.stable_horse_id, r.zone]))).toEqual({ a: 'promote', b: null, c: 'relegate' });
  });

  it('does NOT shrink single-zone divisions (only the overlap case is clamped)', () => {
    // Bottom pool (division 3 of 3), k=3, count 2 → 2 promotions; no relegate zone to overlap,
    // so the floor(k/2) clamp must NOT apply (this is the common season-1 bottom-pool case).
    const bottom = buildSeasonStandings({ ...common, promote_relegate_count: 2, standings: [
      st({ division: 3, stable_horse_id: 'p1', points: 9 }),
      st({ division: 3, stable_horse_id: 'p2', points: 5 }),
      st({ division: 3, stable_horse_id: 'safe', points: 1 }),
    ] });
    expect(Object.fromEntries(bottom.divisions[2]!.rows.map(r => [r.stable_horse_id, r.zone])))
      .toEqual({ p1: 'promote', p2: 'promote', safe: null });

    // Top flight (division 1), k=3, count 2 → 2 relegations; no promote zone.
    const top = buildSeasonStandings({ ...common, promote_relegate_count: 2, standings: [
      st({ division: 1, stable_horse_id: 'safe', points: 9 }),
      st({ division: 1, stable_horse_id: 'r1', points: 5 }),
      st({ division: 1, stable_horse_id: 'r2', points: 1 }),
    ] });
    expect(Object.fromEntries(top.divisions[0]!.rows.map(r => [r.stable_horse_id, r.zone])))
      .toEqual({ safe: null, r1: 'relegate', r2: 'relegate' });
  });
});
