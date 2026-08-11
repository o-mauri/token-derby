import { describe, it, expect } from 'vitest';
import { mapStandings } from '../src/screens/race-standings.js';
import type { RaceView, HorseView, HorseColors } from '@token-derby/shared';

const COLORS: HorseColors = { body: '#8B4513', mane: '#f5e9d3', tail: '#f5e9d3', saddle: '#3d2856' };

function fakeHorse(overrides: Partial<HorseView> & { horse_id: string; stable_horse_id: string; rank: number }): HorseView {
  return {
    name: 'Horse',
    colors: COLORS,
    current_tokens: 0,
    last_heartbeat: '2026-07-18T00:00:00.000Z',
    joined_at: '2026-07-18T00:00:00.000Z',
    user_id: 'user-1',
    user_name: 'Jockey',
    xp: 0,
    ...overrides,
  };
}

function fakeRace(horses: HorseView[], statusOverride?: RaceView['status']): RaceView {
  return {
    race_id: 'race-1',
    name: 'Test Race',
    start_time: '2026-07-18T00:00:00.000Z',
    end_time: '2026-07-18T01:00:00.000Z',
    tz: 'UTC',
    max_participants: 8,
    join_code: 'ABC123',
    created_at: '2026-07-18T00:00:00.000Z',
    status: statusOverride ?? 'live',
    horses,
    server_time: '2026-07-18T00:30:00.000Z',
    time_left_seconds: 1800,
  };
}

describe('mapStandings', () => {
  const horses: HorseView[] = [
    fakeHorse({ horse_id: 'h-2', stable_horse_id: 'sh-2', rank: 2, name: 'Second Place', current_tokens: 500 }),
    fakeHorse({ horse_id: 'h-1', stable_horse_id: 'sh-1', rank: 1, name: 'First Place', current_tokens: 1000 }),
    fakeHorse({ horse_id: 'h-3', stable_horse_id: 'sh-3', rank: 3, name: 'Third Place', current_tokens: 100 }),
  ];

  it('sorts standings by rank ascending', () => {
    const race = fakeRace(horses);
    const result = mapStandings(race, new Set());
    expect(result.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(result.map((r) => r.horse_id)).toEqual(['h-1', 'h-2', 'h-3']);
  });

  it('marks the rank-1 horse as leader and no others', () => {
    const race = fakeRace(horses);
    const result = mapStandings(race, new Set());
    expect(result.find((r) => r.horse_id === 'h-1')!.isLeader).toBe(true);
    expect(result.find((r) => r.horse_id === 'h-2')!.isLeader).toBe(false);
    expect(result.find((r) => r.horse_id === 'h-3')!.isLeader).toBe(false);
  });

  it('marks a horse as "you" when its stable_horse_id is in yourHorseIds', () => {
    const race = fakeRace(horses);
    const result = mapStandings(race, new Set(['sh-2']));
    expect(result.find((r) => r.horse_id === 'h-2')!.isYou).toBe(true);
    expect(result.find((r) => r.horse_id === 'h-1')!.isYou).toBe(false);
    expect(result.find((r) => r.horse_id === 'h-3')!.isYou).toBe(false);
  });

  it('carries through name and formatted-ready token count', () => {
    const race = fakeRace(horses);
    const result = mapStandings(race, new Set());
    const first = result.find((r) => r.horse_id === 'h-1')!;
    expect(first.name).toBe('First Place');
    expect(first.tokens).toBe(1000);
  });

  // The server ranks by scored distance (api/src/lib/rank-horses.ts), so the
  // number shown has to be the scored one or the list contradicts its own order.
  it('shows scored tokens rather than raw while the race is live', () => {
    const race = fakeRace([
      fakeHorse({ horse_id: 'h-1', stable_horse_id: 'sh-1', rank: 1, current_tokens: 1000, scored_tokens: 800 }),
    ]);
    expect(mapStandings(race, new Set())[0].tokens).toBe(800);
  });

  it('falls back to raw tokens for rows written before scoring existed', () => {
    const race = fakeRace([
      fakeHorse({ horse_id: 'h-1', stable_horse_id: 'sh-1', rank: 1, current_tokens: 1000 }),
    ]);
    expect(mapStandings(race, new Set())[0].tokens).toBe(1000);
  });

  it('prefers final_scored_tokens once the race has finished', () => {
    const race = fakeRace(
      [
        fakeHorse({
          horse_id: 'h-1',
          stable_horse_id: 'sh-1',
          rank: 1,
          current_tokens: 1000,
          scored_tokens: 800,
          final_tokens: 1234,
          final_scored_tokens: 1500,
        }),
      ],
      'finished',
    );
    expect(mapStandings(race, new Set())[0].tokens).toBe(1500);
  });

  it('prefers final_tokens over current_tokens once the race has finished', () => {
    const race = fakeRace(
      [fakeHorse({ horse_id: 'h-1', stable_horse_id: 'sh-1', rank: 1, current_tokens: 1000, final_tokens: 1234 })],
      'finished',
    );
    const result = mapStandings(race, new Set());
    expect(result[0].tokens).toBe(1234);
  });

  it('carries through the equipped hat when present', () => {
    const hat = { id: 'flat_cap', variant: 0, obtained_at: '2026-07-18T00:00:00.000Z' };
    const race = fakeRace([fakeHorse({ horse_id: 'h-1', stable_horse_id: 'sh-1', rank: 1, equipped_hat: hat })]);
    const result = mapStandings(race, new Set());
    expect(result[0].hat).toEqual(hat);
  });
});
