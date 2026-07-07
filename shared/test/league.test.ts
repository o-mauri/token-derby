import { describe, it, expect } from 'vitest';
import { validateLeagueConfig, leagueFixtureName, type LeagueConfigInput } from '../src/league.js';

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
