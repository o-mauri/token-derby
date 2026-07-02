import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderRace } from '../src/render/race.js';

// Non-TV mode was removed: the site is always in TV mode, with no toggle.
function liveRaceJson() {
  const now = Date.now();
  return {
    race_id: 'r1', name: 'Live', join_code: 'ABC123',
    start_time: new Date(now - 3_600_000).toISOString(),
    end_time: new Date(now + 3_600_000).toISOString(),
    tz: 'UTC', max_participants: 30, created_at: new Date(now - 7_200_000).toISOString(),
    status: 'live', server_time: new Date(now).toISOString(), time_left_seconds: 3600,
    horses: [],
  };
}

describe('TV mode is the only mode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.className = '';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify(liveRaceJson()), { status: 200, headers: { 'content-type': 'application/json' } },
    )));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.className = '';
  });

  it('renderRace always puts the page in TV mode', () => {
    const root = document.createElement('div');
    renderRace(root, 'ABC123');
    expect(document.body.classList.contains('tv')).toBe(true);
  });

  it('renders no TV on/off toggle', () => {
    const root = document.createElement('div');
    renderRace(root, 'ABC123');
    expect(root.querySelector('.tv-toggle')).toBeNull();
  });
});
