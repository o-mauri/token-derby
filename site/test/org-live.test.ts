import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ListOrgRacesResponse, RaceSummary } from '@token-derby/shared';

const fetchOrgRaces = vi.fn<() => Promise<ListOrgRacesResponse>>();
vi.mock('../src/api.js', async () => {
  const actual = await vi.importActual<typeof import('../src/api.js')>('../src/api.js');
  return { ...actual, fetchOrgRaces: () => fetchOrgRaces() };
});

// The embedded race view is heavy (its own polling, ResizeObserver, etc.) —
// org-live only orchestrates *which* race it shows, so stub it.
const raceCleanup = vi.fn();
const renderRace = vi.fn((_root: HTMLElement, _joinCode: string) => raceCleanup);
vi.mock('../src/render/race.js', () => ({ renderRace: (root: HTMLElement, code: string) => renderRace(root, code) }));

import { renderOrgLive, pickLiveOrLastRace } from '../src/render/org-live.js';

function race(over: Partial<RaceSummary>): RaceSummary {
  return {
    race_id: 'r', name: 'Race', join_code: 'AAAAAA',
    start_time: '2026-06-04T09:00:00Z', end_time: '2026-06-04T17:00:00Z',
    status: 'finished',
    ...over,
  };
}

function resp(races: RaceSummary[]): ListOrgRacesResponse {
  return { org_name: 'Acme', races };
}

const flush = () => new Promise<void>((r) => { r(); }).then(() => Promise.resolve());

describe('pickLiveOrLastRace', () => {
  it('prefers the live race', () => {
    const pick = pickLiveOrLastRace([
      race({ join_code: 'FIN111', status: 'finished' }),
      race({ join_code: 'LIV222', status: 'live' }),
      race({ join_code: 'PEN333', status: 'pending' }),
    ]);
    expect(pick?.join_code).toBe('LIV222');
  });

  it('picks the most recently started live race when several overlap', () => {
    const pick = pickLiveOrLastRace([
      race({ join_code: 'OLD111', status: 'live', start_time: '2026-06-04T08:00:00Z' }),
      race({ join_code: 'NEW222', status: 'live', start_time: '2026-06-04T10:00:00Z' }),
    ]);
    expect(pick?.join_code).toBe('NEW222');
  });

  it('falls back to the most recently started finished race', () => {
    const pick = pickLiveOrLastRace([
      race({ join_code: 'OLD111', status: 'finished', start_time: '2026-06-01T09:00:00Z' }),
      race({ join_code: 'NEW222', status: 'finished', start_time: '2026-06-03T09:00:00Z' }),
      race({ join_code: 'PEN333', status: 'pending' }),
    ]);
    expect(pick?.join_code).toBe('NEW222');
  });

  it('falls back to the soonest pending race when nothing has run', () => {
    const pick = pickLiveOrLastRace([
      race({ join_code: 'LAT111', status: 'pending', start_time: '2026-06-10T09:00:00Z' }),
      race({ join_code: 'SOO222', status: 'pending', start_time: '2026-06-05T09:00:00Z' }),
    ]);
    expect(pick?.join_code).toBe('SOO222');
  });

  it('returns null for no races', () => {
    expect(pickLiveOrLastRace([])).toBeNull();
  });
});

describe('renderOrgLive', () => {
  let root: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-04T12:00:00Z'));
    fetchOrgRaces.mockReset();
    renderRace.mockClear();
    raceCleanup.mockClear();
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    vi.useRealTimers();
    root.remove();
  });

  it('renders the live race', async () => {
    fetchOrgRaces.mockResolvedValue(resp([
      race({ join_code: 'FIN111', status: 'finished' }),
      race({ join_code: 'LIV222', status: 'live' }),
    ]));
    const cleanup = renderOrgLive(root, 'Acme');
    await flush();
    expect(renderRace).toHaveBeenCalledTimes(1);
    expect(renderRace).toHaveBeenCalledWith(root, 'LIV222');
    cleanup();
  });

  it('switches to a new live race on re-resolve, tearing down the old view', async () => {
    fetchOrgRaces.mockResolvedValue(resp([race({ join_code: 'FIN111', status: 'finished' })]));
    const cleanup = renderOrgLive(root, 'Acme');
    await flush();
    expect(renderRace).toHaveBeenCalledWith(root, 'FIN111');

    // A new race goes live; the next resolve tick should swap to it.
    fetchOrgRaces.mockResolvedValue(resp([
      race({ join_code: 'FIN111', status: 'finished' }),
      race({ join_code: 'LIV222', status: 'live' }),
    ]));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(raceCleanup).toHaveBeenCalledTimes(1);
    expect(renderRace).toHaveBeenLastCalledWith(root, 'LIV222');
    cleanup();
  });

  it('does not re-render while the pick is unchanged', async () => {
    fetchOrgRaces.mockResolvedValue(resp([race({ join_code: 'LIV222', status: 'live' })]));
    const cleanup = renderOrgLive(root, 'Acme');
    await flush();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(renderRace).toHaveBeenCalledTimes(1);
    expect(raceCleanup).not.toHaveBeenCalled();
    cleanup();
  });

  it('keeps showing the current race if a re-resolve fails', async () => {
    fetchOrgRaces.mockResolvedValue(resp([race({ join_code: 'LIV222', status: 'live' })]));
    const cleanup = renderOrgLive(root, 'Acme');
    await flush();
    fetchOrgRaces.mockRejectedValue(new Error('network down'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(raceCleanup).not.toHaveBeenCalled();
    expect(renderRace).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('shows a message when the org has no races', async () => {
    fetchOrgRaces.mockResolvedValue(resp([]));
    const cleanup = renderOrgLive(root, 'Acme');
    await flush();
    expect(renderRace).not.toHaveBeenCalled();
    expect(root.textContent).toContain('No races yet');
    cleanup();
  });

  it('cleanup stops the resolve loop and tears down the race view', async () => {
    fetchOrgRaces.mockResolvedValue(resp([race({ join_code: 'LIV222', status: 'live' })]));
    const cleanup = renderOrgLive(root, 'Acme');
    await flush();
    cleanup();
    expect(raceCleanup).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const calls = fetchOrgRaces.mock.calls.length;
    await vi.advanceTimersByTimeAsync(300_000);
    expect(fetchOrgRaces.mock.calls.length).toBe(calls);
    cleanup();
  });
});
