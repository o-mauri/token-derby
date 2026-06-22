import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderRace } from '../src/render/race.js';

function finishedRaceJson() {
  const now = Date.now();
  return {
    race_id: 'r1', name: 'Done', join_code: 'ABC123',
    start_time: new Date(now - 3_600_000).toISOString(),
    end_time: new Date(now - 60_000).toISOString(),
    ended_at: new Date(now - 60_000).toISOString(),
    tz: 'UTC', max_participants: 30, created_at: new Date(now - 7_200_000).toISOString(),
    status: 'finished', server_time: new Date(now).toISOString(), time_left_seconds: 0,
    horses: [],
  };
}

describe('renderRace polling lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('stops polling after the race is finished', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { calls++;
      return new Response(JSON.stringify(finishedRaceJson()), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const root = document.createElement('div');
    renderRace(root, 'ABC123');

    await vi.advanceTimersByTimeAsync(0);      // first poll fires
    const afterFirst = calls;
    expect(afterFirst).toBeGreaterThan(0);     // confirm first poll actually fired
    await vi.advanceTimersByTimeAsync(120_000); // two minutes of would-be polls
    expect(calls).toBe(afterFirst);            // no further polls after finished
  });
});
