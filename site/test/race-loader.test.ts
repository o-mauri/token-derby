import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderRace } from '../src/render/race.js';

function liveRaceJson() {
  const now = Date.now();
  return {
    race_id: 'r1', name: 'Showdown', join_code: 'ABC123',
    start_time: new Date(now - 3_600_000).toISOString(),
    end_time: new Date(now + 3_600_000).toISOString(),
    tz: 'UTC', max_participants: 30, created_at: new Date(now - 7_200_000).toISOString(),
    status: 'live', server_time: new Date(now).toISOString(), time_left_seconds: 3600,
    horses: [],
  };
}

describe('renderRace loader', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('shows the loader in the track and a blank title until the first snapshot', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    vi.stubGlobal('fetch', vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify(liveRaceJson()), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const root = document.createElement('div');
    const cleanup = renderRace(root, 'ABC123');
    await vi.advanceTimersByTimeAsync(0);

    expect(root.querySelector('.track > .loader')).not.toBeNull();
    expect(root.querySelector('.race-name')?.textContent).toBe('');

    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.loader')).toBeNull();
    expect(root.querySelector('.race-name')?.textContent).toBe('Showdown');
    cleanup();
  });
});
