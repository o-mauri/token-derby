import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GetRaceResponse, HorseView, SeasonStandings } from '@token-derby/shared';

// Capture every setCells batch pushed to the ticker so we can assert the live
// composition (order → projected standings) without driving the rAF animation.
const hoisted = vi.hoisted(() => ({ batches: [] as any[][] }));
vi.mock('../src/render/ticker.js', async (importActual) => {
  const actual = await importActual<typeof import('../src/render/ticker.js')>();
  return {
    ...actual,
    createTicker: () => ({
      el: document.createElement('div'),
      setCells: (cells: any[]) => { hoisted.batches.push(cells); },
      destroy: () => {},
    }),
  };
});

import { renderRace } from '../src/render/race.js';

const lh = (over: Partial<HorseView>): HorseView => ({
  horse_id: over.horse_id!, stable_horse_id: over.horse_id!, name: over.name!,
  colors: { body: '#000', mane: '#000', tail: '#000', saddle: '#000' },
  current_tokens: over.current_tokens ?? 0, rank: 0, last_heartbeat: new Date(0).toISOString(),
  joined_at: new Date(0).toISOString(), user_id: 'u', user_name: 'U', xp: 0, division: over.division,
} as HorseView);

function leagueSnapshot(): GetRaceResponse {
  const horses = [
    lh({ horse_id: 'comet', name: 'Comet', division: 1, current_tokens: 4820 }),
    lh({ horse_id: 'bolt', name: 'Bolt', division: 1, current_tokens: 4310 }),
    lh({ horse_id: 'dash', name: 'Dash', division: 1, current_tokens: 3120 }),
    lh({ horse_id: 'ada', name: 'Ada', division: 1, current_tokens: 1980 }),
    lh({ horse_id: 'oak', name: 'Oak', division: 2, current_tokens: 4550 }),
    lh({ horse_id: 'newbie', name: 'Newbie', division: 2, current_tokens: 3400 }),
  ].map((h, i) => ({ ...h, rank: i + 1 }));
  return {
    race_id: 'r', name: 'League', join_code: 'LGE123',
    start_time: new Date(Date.now() - 3_600_000).toISOString(),
    end_time: new Date(Date.now() + 3_600_000).toISOString(),
    tz: 'UTC', max_participants: 30, created_at: new Date(Date.now() - 7_200_000).toISOString(),
    organisation_name: 'Anthropic', status: 'live', server_time: new Date().toISOString(),
    time_left_seconds: 3600, horses,
    league_id: 'org1', league_season: 2, league_round: 3,
    league_division_names: ['Premier', 'Championship'],
  } as GetRaceResponse;
}

const STANDINGS: SeasonStandings = {
  org_name: 'Anthropic', season: 2, round: 3, races_per_season: 8,
  divisions: [
    { division: 1, name: 'Premier', rows: [
      { rank: 1, stable_horse_id: 'bolt', horse_name: 'Bolt', user_name: 'U', points: 24, season_tokens: 90000, zone: null },
      { rank: 2, stable_horse_id: 'ada', horse_name: 'Ada', user_name: 'U', points: 18, season_tokens: 72000, zone: null },
      { rank: 3, stable_horse_id: 'comet', horse_name: 'Comet', user_name: 'U', points: 10, season_tokens: 60000, zone: null },
      { rank: 4, stable_horse_id: 'dash', horse_name: 'Dash', user_name: 'U', points: 6, season_tokens: 40000, zone: null },
    ] },
    { division: 2, name: 'Championship', rows: [
      { rank: 1, stable_horse_id: 'oak', horse_name: 'Oak', user_name: 'U', points: 15, season_tokens: 55000, zone: null },
    ] },
  ],
};

describe('renderRace — league standings in the ticker', () => {
  beforeEach(() => { hoisted.batches.length = 0; vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('interleaves the projected league standings after the order once standings load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(leagueSnapshot()), { status: 200, headers: { 'content-type': 'application/json' } })));
    const fetchStandings = vi.fn(async () => ({ standings: STANDINGS }));

    const root = document.createElement('div');
    renderRace(root, 'LGE123', { fetchStandings });

    await vi.advanceTimersByTimeAsync(0); // first poll + standings promise resolve

    expect(fetchStandings).toHaveBeenCalledWith('Anthropic', 2);
    // The latest batch should carry standing cells (recomposed once standings arrived).
    const last = hoisted.batches.at(-1)!;
    const standingCells = last.filter((c) => c.kind === 'standing');
    expect(standingCells.length).toBeGreaterThan(0);

    // Order section comes before the standings section.
    const firstOrder = last.findIndex((c) => c.kind === 'order');
    const firstStanding = last.findIndex((c) => c.kind === 'standing');
    expect(firstOrder).toBeGreaterThanOrEqual(0);
    expect(firstStanding).toBeGreaterThan(firstOrder);

    // Projected totals match: Bolt = 24 pre + 15 (2nd in Premier) = 39 (+15).
    const bolt = standingCells.find((c) => c.horseName === 'Bolt');
    expect(bolt).toMatchObject({ total: 39, gain: 15 });
    // New entrant folded in at 0 pre + 15 (2nd in Championship) = 15 (+15).
    const newbie = standingCells.find((c) => c.horseName === 'Newbie');
    expect(newbie).toMatchObject({ total: 15, gain: 15 });
  });

  it('still renders the order (no standings section) when standings fail to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(leagueSnapshot()), { status: 200, headers: { 'content-type': 'application/json' } })));
    const fetchStandings = vi.fn(async () => { throw new Error('boom'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const root = document.createElement('div');
    renderRace(root, 'LGE123', { fetchStandings });
    await vi.advanceTimersByTimeAsync(0);

    const last = hoisted.batches.at(-1)!;
    expect(last.some((c) => c.kind === 'order')).toBe(true);
    expect(last.some((c) => c.kind === 'standing')).toBe(false);
  });
});
