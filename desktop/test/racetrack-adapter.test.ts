// @vitest-environment happy-dom
//
// Exercises the two decoupled seams from the D1 brief: the injected `getRace`
// (standing in for window.api.getRace) and the injected `onExit` (standing in
// for closing the BrowserWindow). The key assertion across every case is that
// `window.history` is never touched — the site's original renderer navigates
// home via pushState+popstate on race finish and on the home button; this
// port must never do that, since there is no site router to return to.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GetRaceResponse, HorseView } from '@token-derby/shared';
import { renderRace } from '../src/racetrack/render.js';

function race(overrides: Partial<GetRaceResponse> = {}): GetRaceResponse {
  const now = Date.now();
  return {
    race_id: 'r1',
    name: 'Derby 1',
    join_code: 'ABC123',
    start_time: new Date(now - 3_600_000).toISOString(),
    end_time: new Date(now + 3_600_000).toISOString(),
    tz: 'UTC',
    max_participants: 30,
    created_at: new Date(now - 7_200_000).toISOString(),
    status: 'live',
    horses: [],
    server_time: new Date(now).toISOString(),
    time_left_seconds: 3_600,
    ...overrides,
  };
}

function horse(id: string, tokens: number, name: string, extras: Partial<HorseView> = {}): HorseView {
  return {
    horse_id: id,
    stable_horse_id: `sh-${id}`,
    name,
    colors: { body: '#8B4513', mane: '#000', tail: '#000', saddle: '#C0392B' },
    current_tokens: tokens,
    last_heartbeat: new Date().toISOString(),
    joined_at: new Date(Date.now() - 3_500_000).toISOString(),
    rank: 1,
    user_id: `user-${id}`,
    user_name: `User ${id.toUpperCase()}`,
    xp: 0,
    ...extras,
  };
}

describe('racetrack render adapter', () => {
  let root: HTMLElement;
  let historySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    historySpy = vi.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders one lane per horse from the injected getRace, without touching window.history', async () => {
    const fixture = race({
      horses: [horse('a', 500, 'Alpha'), horse('b', 200, 'Bravo')],
    });
    const getRace = vi.fn().mockResolvedValue(fixture);
    const onExit = vi.fn();

    const destroy = renderRace(root, { joinCode: 'ABC123', getRace, onExit });

    await vi.advanceTimersByTimeAsync(0); // let the first (immediate) poll resolve

    expect(getRace).toHaveBeenCalledTimes(1);
    expect(root.querySelectorAll('.lane')).toHaveLength(2);
    expect(root.querySelector('.race-name')?.textContent).toBe('Derby 1');
    expect(historySpy).not.toHaveBeenCalled();

    destroy();
  });

  it('produces the live standings order in the ticker', async () => {
    const fixture = race({
      horses: [horse('a', 500, 'Alpha'), horse('b', 200, 'Bravo')],
    });
    const getRace = vi.fn().mockResolvedValue(fixture);
    const destroy = renderRace(root, { joinCode: 'ABC123', getRace, onExit: vi.fn() });

    await vi.advanceTimersByTimeAsync(0);

    const names = Array.from(root.querySelectorAll('.ticker-order-name')).map((n) => n.textContent);
    expect(names).toEqual(['Alpha', 'Bravo']);
    expect(historySpy).not.toHaveBeenCalled();

    destroy();
  });

  it('renders the podium/standings overlay when the race is finished, without touching window.history', async () => {
    const fixture = race({
      status: 'finished',
      horses: [
        horse('a', 900, 'Alpha', { rank: 1 }),
        horse('b', 700, 'Bravo', { rank: 2 }),
        horse('c', 500, 'Charlie', { rank: 3 }),
        horse('d', 300, 'Delta', { rank: 4 }),
      ],
    });
    const getRace = vi.fn().mockResolvedValue(fixture);
    const destroy = renderRace(root, { joinCode: 'ABC123', getRace, onExit: vi.fn() });

    await vi.advanceTimersByTimeAsync(0);

    expect(root.querySelector('.podium')).not.toBeNull();
    expect(root.querySelector('.standings-table')).not.toBeNull(); // Delta, the 4th horse
    expect(historySpy).not.toHaveBeenCalled();

    destroy();
  });

  it('calls the injected onExit (not window.history) when the close button is clicked', async () => {
    const getRace = vi.fn().mockResolvedValue(race());
    const onExit = vi.fn();
    const destroy = renderRace(root, { joinCode: 'ABC123', getRace, onExit });

    await vi.advanceTimersByTimeAsync(0);

    root.querySelector<HTMLButtonElement>('.home-btn')!.click();

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(historySpy).not.toHaveBeenCalled();

    destroy();
  });

  it('stops polling once the race is finished', async () => {
    const finished = race({ status: 'finished', horses: [] });
    const getRace = vi.fn().mockResolvedValue(finished);
    const destroy = renderRace(root, { joinCode: 'ABC123', getRace, onExit: vi.fn() });

    await vi.advanceTimersByTimeAsync(0);
    const callsAfterFirst = getRace.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(getRace.mock.calls.length).toBe(callsAfterFirst);

    destroy();
  });

  it('never calls getRace again after destroy() is called', async () => {
    const getRace = vi.fn().mockResolvedValue(race());
    const destroy = renderRace(root, { joinCode: 'ABC123', getRace, onExit: vi.fn() });

    await vi.advanceTimersByTimeAsync(0);
    destroy();
    const callsAfterDestroy = getRace.mock.calls.length;

    await vi.advanceTimersByTimeAsync(120_000);
    expect(getRace.mock.calls.length).toBe(callsAfterDestroy);
  });
});
