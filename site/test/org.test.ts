import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ListOrgRacesResponse, RaceSummary } from '@token-derby/shared';

// Mock the api module so renderOrg's fetchOrgRaces resolves with our fixture
// without touching the network or the global fetch.
const fetchOrgRaces = vi.fn<() => Promise<ListOrgRacesResponse>>();
vi.mock('../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../src/api.js')>('../src/api.js');
  return { ...actual, fetchOrgRaces: () => fetchOrgRaces() };
});

import { renderOrg } from '../src/render/org.js';

const PALETTE = { body: '#8B4513', mane: '#1F1108', tail: '#1F1108', saddle: '#C0392B' };

function resp(races: RaceSummary[]): ListOrgRacesResponse {
  return { org_name: 'Acme', races };
}

// renderOrg resolves the fetch promise asynchronously; flush microtasks.
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
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
