import { describe, it, expect } from 'vitest';
import type { GetRaceResponse, HeartbeatResponse, HorseView } from '@token-derby/shared';
import { deriveStatus } from '../electron/racing/status.js';

function horse(overrides: Partial<HorseView> = {}): HorseView {
  return {
    horse_id: 'horse-1',
    stable_horse_id: 'stable-1',
    name: 'Thunder',
    colors: { body: '#111', mane: '#222', tail: '#333', saddle: '#444' },
    current_tokens: 120,
    last_heartbeat: new Date().toISOString(),
    joined_at: new Date().toISOString(),
    user_id: 'u1',
    user_name: 'Alice',
    xp: 0,
    rank: 2,
    ...overrides,
  };
}

function getRaceResponse(overrides: Partial<GetRaceResponse> = {}): GetRaceResponse {
  return {
    race_id: 'race-1',
    join_code: 'ABC123',
    name: 'Test Race',
    start_time: '',
    end_time: '',
    tz: 'UTC',
    max_participants: 10,
    created_at: '',
    status: 'live',
    horses: [horse()],
    server_time: new Date().toISOString(),
    time_left_seconds: 100,
    ...overrides,
  };
}

function heartbeatResponse(overrides: Partial<HeartbeatResponse> = {}): HeartbeatResponse {
  return {
    race_status: 'live',
    server_time: new Date().toISOString(),
    time_left_seconds: 90,
    last_seq: 5,
    horses: [horse()],
    race: {
      race_id: 'race-1',
      join_code: 'XYZ999',
      name: 'Heartbeat Race',
      start_time: '',
      end_time: '',
      tz: 'UTC',
      max_participants: 10,
      created_at: '',
    },
    ...overrides,
  };
}

describe('deriveStatus', () => {
  it('extracts joinCode/status from a GetRaceResponse and rank/tokens from the matching horse', () => {
    const resp = getRaceResponse();
    const status = deriveStatus(resp, 'horse-1', 'Test Race');
    expect(status).toEqual({
      joinCode: 'ABC123',
      raceName: 'Test Race',
      horseId: 'horse-1',
      rank: 2,
      tokens: 120,
      status: 'live',
      stalled: false,
    });
  });

  it('extracts joinCode/status from a HeartbeatResponse (nested race + race_status)', () => {
    const resp = heartbeatResponse();
    const status = deriveStatus(resp, 'horse-1', 'Heartbeat Race');
    expect(status.joinCode).toBe('XYZ999');
    expect(status.status).toBe('live');
    expect(status.rank).toBe(2);
    expect(status.tokens).toBe(120);
  });

  it('falls back to rank: null and tokens: 0 when the horse is not present in resp.horses', () => {
    const resp = getRaceResponse({ horses: [horse({ horse_id: 'someone-else' })] });
    const status = deriveStatus(resp, 'horse-1', 'Test Race');
    expect(status.rank).toBeNull();
    expect(status.tokens).toBe(0);
  });

  it('passes the stalled flag through unchanged (default false)', () => {
    const resp = getRaceResponse();
    expect(deriveStatus(resp, 'horse-1', 'Test Race').stalled).toBe(false);
    expect(deriveStatus(resp, 'horse-1', 'Test Race', true).stalled).toBe(true);
  });

  it('finds the correct horse among several by horse_id', () => {
    const resp = getRaceResponse({
      horses: [
        horse({ horse_id: 'other-1', rank: 1, current_tokens: 999 }),
        horse({ horse_id: 'horse-1', rank: 3, current_tokens: 50 }),
      ],
    });
    const status = deriveStatus(resp, 'horse-1', 'Test Race');
    expect(status.rank).toBe(3);
    expect(status.tokens).toBe(50);
  });
});
