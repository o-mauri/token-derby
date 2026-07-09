import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ListOrgRacesResponse, RaceSummary, GetLeagueStandingsResponse, SeasonStandings } from '@token-derby/shared';

// Mock the api module so renderOrg's fetchOrgRaces resolves with our fixture
// without touching the network or the global fetch.
const fetchOrgRaces = vi.fn<() => Promise<ListOrgRacesResponse>>();
const fetchStandings = vi.fn<() => Promise<GetLeagueStandingsResponse>>();
vi.mock('../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../src/api.js')>('../src/api.js');
  return { ...actual, fetchOrgRaces: () => fetchOrgRaces(), fetchOrgLeagueStandings: () => fetchStandings() };
});

import { renderOrg } from '../src/render/org.js';

const PALETTE = { body: '#8B4513', mane: '#1F1108', tail: '#1F1108', saddle: '#C0392B' };

function resp(races: RaceSummary[]): ListOrgRacesResponse {
  return { org_name: 'Acme', races };
}

// renderOrg resolves the fetch promise asynchronously; flush microtasks.
async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

let root: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  // Anchor Date.now() so live-countdown anchors are deterministic.
  vi.setSystemTime(new Date('2026-06-04T12:00:00Z'));
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
  fetchOrgRaces.mockReset();
  fetchStandings.mockReset();
  fetchStandings.mockResolvedValue({ standings: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('renderOrg', () => {
  it('renders a finished row with sprite, winner name, token count and date', async () => {
    fetchOrgRaces.mockResolvedValue(resp([
      {
        race_id: 'r1', name: 'Showdown', join_code: 'MNO345',
        start_time: '2026-05-01T09:00:00Z', end_time: '2026-05-01T13:00:00Z',
        status: 'finished', ended_at: '2026-05-01T12:00:00Z',
        highlight: { horse_name: 'Thunderbolt', tokens: 980421, colors: PALETTE },
      },
    ]));
    const cleanup = renderOrg(root, 'Acme');
    await flush();

    const row = root.querySelector('.race-row')!;
    // Sprite sits inside the winner line, next to the horse name.
    expect(row.querySelector('.race-row-winner .race-row-sprite svg.horse-sprite')).not.toBeNull();
    expect(row.querySelector('.race-row-name')?.textContent).toBe('Showdown');
    expect(row.querySelector('.race-row-code')?.textContent).toBe('MNO345');
    const winner = row.querySelector('.race-row-winner')!;
    expect(winner.textContent).toContain('Thunderbolt');
    expect(winner.textContent).toContain((980421).toLocaleString());
    expect(winner.textContent).toContain('🏆');
    // Date derived from ended_at, "MMM D", shown in the left meta line next to the code.
    const expected = new Date('2026-05-01T12:00:00Z')
      .toLocaleString(undefined, { month: 'short', day: 'numeric' });
    expect(row.querySelector('.race-row-meta .race-row-date')?.textContent).toBe(expected);
    cleanup();
  });

  it('renders a live row with sprite, leader, tokens and a ticking countdown', async () => {
    fetchOrgRaces.mockResolvedValue(resp([
      {
        race_id: 'r1', name: 'Sprint', join_code: 'ABC123',
        start_time: '2026-06-04T11:30:00Z', end_time: '2026-06-04T14:00:00Z',
        status: 'live', time_left_seconds: 65,
        highlight: { horse_name: 'Comet', tokens: 1234, colors: PALETTE },
      },
    ]));
    const cleanup = renderOrg(root, 'Acme');
    await flush();

    const row = root.querySelector('.race-row')!;
    // Sprite sits inside the leader line, next to the horse name.
    expect(row.querySelector('.race-row-leader .race-row-sprite svg.horse-sprite')).not.toBeNull();
    const leader = row.querySelector('.race-row-leader')!;
    expect(leader.textContent).toContain('Comet');
    expect(leader.textContent).toContain((1234).toLocaleString());
    expect(row.querySelector('.race-row-label')?.textContent).toBe('Current leader');

    // Countdown lives in the left meta line, next to the join code.
    const countdown = row.querySelector('.race-row-meta .race-row-countdown')!;
    expect(countdown.textContent).toBe('00:01:05'); // 65s

    vi.advanceTimersByTime(5000);
    expect(countdown.textContent).toBe('00:01:00'); // 60s

    // Run past the end → "Finished".
    vi.advanceTimersByTime(60_000);
    expect(countdown.textContent).toBe('Finished');
    // Leader info stays put.
    expect(row.querySelector('.race-row-leader')?.textContent).toContain('Comet');
    cleanup();
  });

  it('renders a pending row with a "Starts in" countdown', async () => {
    fetchOrgRaces.mockResolvedValue(resp([
      {
        race_id: 'r1', name: 'Warm-up', join_code: 'GHI789',
        start_time: '2026-06-04T12:00:30Z', end_time: '2026-06-04T14:00:00Z',
        status: 'pending',
      },
    ]));
    const cleanup = renderOrg(root, 'Acme');
    await flush();

    const countdown = root.querySelector('.race-row-countdown')!;
    expect(countdown.textContent).toBe('Starts in 00:00:30');
    vi.advanceTimersByTime(10_000);
    expect(countdown.textContent).toBe('Starts in 00:00:20');
    // Start time shown in the left meta line next to the code.
    const expected = new Date('2026-06-04T12:00:30Z').toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    expect(root.querySelector('.race-row-meta .race-row-date')?.textContent).toBe(expected);
    cleanup();
  });

  it('renders a row without a highlight: no sprite, still name/code', async () => {
    fetchOrgRaces.mockResolvedValue(resp([
      {
        race_id: 'r1', name: 'Empty Live', join_code: 'DEF456',
        start_time: '2026-06-04T11:00:00Z', end_time: '2026-06-04T14:00:00Z',
        status: 'live', time_left_seconds: 100,
      },
    ]));
    const cleanup = renderOrg(root, 'Acme');
    await flush();

    const row = root.querySelector('.race-row')!;
    expect(row.querySelector('.race-row-sprite')).toBeNull();
    expect(row.querySelector('.race-row-leader')).toBeNull();
    expect(row.querySelector('.race-row-name')?.textContent).toBe('Empty Live');
    expect(row.querySelector('.race-row-code')?.textContent).toBe('DEF456');
    // Live rows carry the countdown (not a date) in the meta line, and no
    // leader label without a highlight.
    expect(row.querySelector('.race-row-date')).toBeNull();
    expect(row.querySelector('.race-row-meta .race-row-countdown')).not.toBeNull();
    expect(row.querySelector('.race-row-label')).toBeNull();
    cleanup();
  });

  it('groups rows into Live / Upcoming / Finished sections', async () => {
    fetchOrgRaces.mockResolvedValue(resp([
      { race_id: 'a', name: 'L', join_code: 'AAA111', start_time: '2026-06-04T11:00:00Z', end_time: '2026-06-04T14:00:00Z', status: 'live', time_left_seconds: 10 },
      { race_id: 'b', name: 'P', join_code: 'BBB222', start_time: '2026-06-05T11:00:00Z', end_time: '2026-06-05T14:00:00Z', status: 'pending' },
      { race_id: 'c', name: 'F', join_code: 'CCC333', start_time: '2026-06-01T11:00:00Z', end_time: '2026-06-01T14:00:00Z', status: 'finished', ended_at: '2026-06-01T13:00:00Z' },
    ]));
    const cleanup = renderOrg(root, 'Acme');
    await flush();
    const titles = Array.from(root.querySelectorAll('.org-section h2')).map(h => h.textContent);
    expect(titles).toEqual(['Live', 'Upcoming', 'Finished']);
    // Only the Live section gets the sticky modifier.
    const sticky = Array.from(root.querySelectorAll('.org-section-live h2')).map(h => h.textContent);
    expect(sticky).toEqual(['Live']);
    cleanup();
  });

  it('cleanup clears the countdown interval', async () => {
    fetchOrgRaces.mockResolvedValue(resp([
      {
        race_id: 'r1', name: 'Sprint', join_code: 'ABC123',
        start_time: '2026-06-04T11:30:00Z', end_time: '2026-06-04T14:00:00Z',
        status: 'live', time_left_seconds: 65,
      },
    ]));
    const cleanup = renderOrg(root, 'Acme');
    await flush();
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);

    // After cleanup, advancing timers must not mutate the countdown.
    const countdown = root.querySelector('.race-row-countdown')!;
    const before = countdown.textContent;
    vi.advanceTimersByTime(10_000);
    expect(countdown.textContent).toBe(before);
  });

  it('does not poll: fetchOrgRaces is called exactly once', async () => {
    fetchOrgRaces.mockResolvedValue(resp([
      { race_id: 'r1', name: 'Sprint', join_code: 'ABC123', start_time: '2026-06-04T11:30:00Z', end_time: '2026-06-04T14:00:00Z', status: 'live', time_left_seconds: 65 },
    ]));
    const cleanup = renderOrg(root, 'Acme');
    await flush();
    vi.advanceTimersByTime(30_000);
    expect(fetchOrgRaces).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('shows the empty state when there are no races', async () => {
    fetchOrgRaces.mockResolvedValue(resp([]));
    const cleanup = renderOrg(root, 'Acme');
    await flush();
    expect(root.querySelector('.org-status')?.textContent).toContain('No races yet');
    cleanup();
  });
});

function leagueStandings(): SeasonStandings {
  return {
    org_name: 'Acme', season: 1, round: 4, races_per_season: 8,
    divisions: [
      { division: 1, name: 'Premier', rows: [
        { rank: 1, stable_horse_id: 'a', horse_name: 'Bolt', user_name: 'sam', points: 54, season_tokens: 900000, zone: null },
        { rank: 2, stable_horse_id: 'b', horse_name: 'Vega', user_name: 'lin', points: 30, season_tokens: 400000, zone: 'relegate' },
      ] },
      { division: 2, name: 'Championship', rows: [
        { rank: 1, stable_horse_id: 'c', horse_name: 'Oak', user_name: 'bex', points: 40, season_tokens: 500000, zone: 'promote' },
        { rank: 2, stable_horse_id: 'd', horse_name: 'Nyx', user_name: 'rho', points: 11, season_tokens: 100000, zone: 'relegate' },
      ] },
    ],
  };
}
const liveRace: RaceSummary = {
  race_id: 'r1', name: 'League Race (4/8)', join_code: 'ABC123',
  start_time: new Date('2026-06-04T11:30:00Z').toISOString(),
  end_time: new Date('2026-06-04T14:00:00Z').toISOString(),
  status: 'live', time_left_seconds: 7200,
  highlight: { horse_name: 'Bolt', tokens: 900000, colors: PALETTE },
};

describe('renderOrg — league standings', () => {
  it('renders side-by-side division standings with names, zones, and a season header', async () => {
    fetchOrgRaces.mockResolvedValue(resp([liveRace]));
    fetchStandings.mockResolvedValue({ standings: leagueStandings() });
    renderOrg(root, 'Acme');
    await flush();
    const standings = root.querySelector('.org-standings');
    expect(standings).toBeTruthy();
    expect(root.querySelectorAll('.div-card').length).toBe(2);
    expect(standings!.textContent).toContain('Premier');
    expect(standings!.textContent).toContain('Championship');
    expect(standings!.textContent).toContain('Season 1');
    expect(standings!.textContent).toContain('Round 4/8');
    expect(root.querySelector('tr.promote')).toBeTruthy();
    expect(root.querySelector('tr.relegate')).toBeTruthy();
    expect(standings!.textContent).toContain('▲ promotion');
    expect(standings!.textContent).toContain('▼ relegation');
    // fixtures still render below the standings
    expect(root.querySelector('.race-list')).toBeTruthy();
  });

  it('omits the standings block for a non-league org', async () => {
    fetchOrgRaces.mockResolvedValue(resp([liveRace]));
    fetchStandings.mockResolvedValue({ standings: null });
    renderOrg(root, 'Acme');
    await flush();
    expect(root.querySelector('.org-standings')).toBeNull();
    expect(root.querySelector('.race-list')).toBeTruthy();
  });

  it('still renders races when the standings fetch fails', async () => {
    fetchOrgRaces.mockResolvedValue(resp([liveRace]));
    fetchStandings.mockRejectedValue(new Error('boom'));
    renderOrg(root, 'Acme');
    await flush();
    expect(root.querySelector('.org-standings')).toBeNull();
    expect(root.querySelector('.race-list')).toBeTruthy();
  });

  it('escapes division and horse/jockey names', async () => {
    fetchOrgRaces.mockResolvedValue(resp([]));
    fetchStandings.mockResolvedValue({ standings: {
      org_name: 'Acme', season: 1, round: 1, races_per_season: 8,
      divisions: [{ division: 1, name: '<b>D</b>', rows: [
        { rank: 1, stable_horse_id: 'a', horse_name: '<i>x</i>', user_name: 'u', points: 1, season_tokens: 0, zone: null },
      ] }],
    } });
    renderOrg(root, 'Acme');
    await flush();
    expect(root.innerHTML).not.toContain('<b>D</b>');
    expect(root.innerHTML).not.toContain('<i>x</i>');
    expect(root.querySelector('.div-card-name')!.textContent).toContain('<b>D</b>'); // rendered as text
  });
});
