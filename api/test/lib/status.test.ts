import { describe, it, expect } from 'vitest';
import { computeStatus, timeLeftSeconds } from '../../src/lib/status.js';
import type { Race } from '@token-derby/shared';

function race(overrides: Partial<Race> = {}): Race {
  return {
    race_id: 'r1',
    name: 'Test',
    start_time: '2026-04-22T09:00:00Z',
    end_time: '2026-04-22T17:00:00Z',
    tz: 'UTC',
    max_participants: 30,
    join_code: 'ABC123',
    created_at: '2026-04-22T08:00:00Z',
    ...overrides,
  };
}

describe('computeStatus', () => {
  it('returns pending before start_time', () => {
    expect(computeStatus(race(), new Date('2026-04-22T08:30:00Z'))).toBe('pending');
  });

  it('returns live between start_time and end_time', () => {
    expect(computeStatus(race(), new Date('2026-04-22T13:00:00Z'))).toBe('live');
  });

  it('returns finished at or after end_time', () => {
    expect(computeStatus(race(), new Date('2026-04-22T17:00:00Z'))).toBe('finished');
    expect(computeStatus(race(), new Date('2026-04-23T00:00:00Z'))).toBe('finished');
  });

  it('returns finished when ended_at is set, regardless of time', () => {
    const r = race({ ended_at: '2026-04-22T10:00:00Z' });
    expect(computeStatus(r, new Date('2026-04-22T11:00:00Z'))).toBe('finished');
  });
});

describe('timeLeftSeconds', () => {
  it('returns seconds remaining until end_time', () => {
    const r = race();
    expect(timeLeftSeconds(r, new Date('2026-04-22T16:59:30Z'))).toBe(30);
  });

  it('returns 0 after end_time', () => {
    const r = race();
    expect(timeLeftSeconds(r, new Date('2026-04-22T17:00:01Z'))).toBe(0);
  });

  it('returns total duration before start', () => {
    const r = race();
    expect(timeLeftSeconds(r, new Date('2026-04-22T08:00:00Z'))).toBe(9 * 60 * 60);
  });
});
