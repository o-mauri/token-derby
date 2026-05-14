import { describe, it, expect } from 'vitest';
import { clampHeartbeat } from '../../src/lib/rate-cap.js';

const ISO = (ms: number) => new Date(ms).toISOString();
const RATE = 500;

describe('clampHeartbeat', () => {
  it('accepts a plausible increase below the rate cap', () => {
    const out = clampHeartbeat({
      previous_tokens: 1_000,
      previous_heartbeat_iso: ISO(0),
      proposed_tokens: 1_500,
      now: new Date(60_000), // 60s later
      max_rate_per_second: RATE,
      // ceiling = 1000 + 500*60 = 31_000; proposed 1500 < ceiling → accepted
    });
    expect(out).toBe(1_500);
  });

  it('clamps an excessive jump to previous + max_rate × elapsed', () => {
    const out = clampHeartbeat({
      previous_tokens: 1_000,
      previous_heartbeat_iso: ISO(0),
      proposed_tokens: 9_999_999,
      now: new Date(60_000),
      max_rate_per_second: RATE,
    });
    // ceiling = 1000 + 500*60 = 31_000
    expect(out).toBe(31_000);
  });

  it('refuses to decrease (monotonic)', () => {
    const out = clampHeartbeat({
      previous_tokens: 5_000,
      previous_heartbeat_iso: ISO(0),
      proposed_tokens: 100,
      now: new Date(60_000),
      max_rate_per_second: RATE,
    });
    expect(out).toBe(5_000);
  });

  it('handles the first heartbeat (previous_tokens = 0, last_heartbeat = joined_at)', () => {
    const out = clampHeartbeat({
      previous_tokens: 0,
      previous_heartbeat_iso: ISO(0),
      proposed_tokens: 1_200,
      now: new Date(60_000),
      max_rate_per_second: RATE,
    });
    // ceiling = 0 + 500*60 = 30_000; proposed 1200 < ceiling
    expect(out).toBe(1_200);
  });

  it('clamps the first heartbeat if the claim is implausible', () => {
    const out = clampHeartbeat({
      previous_tokens: 0,
      previous_heartbeat_iso: ISO(0),
      proposed_tokens: 1_000_000,
      now: new Date(60_000),
      max_rate_per_second: RATE,
    });
    expect(out).toBe(30_000);
  });

  it('treats clock skew (now before previous) as zero elapsed', () => {
    const out = clampHeartbeat({
      previous_tokens: 1_000,
      previous_heartbeat_iso: ISO(60_000),
      proposed_tokens: 2_000,
      now: new Date(0), // earlier than previous
      max_rate_per_second: RATE,
    });
    // elapsed clamped to 0 → ceiling = 1000; proposed 2000 → clamped to 1000
    expect(out).toBe(1_000);
  });

  it('treats invalid previous_heartbeat_iso as zero elapsed', () => {
    const out = clampHeartbeat({
      previous_tokens: 500,
      previous_heartbeat_iso: 'not-a-date',
      proposed_tokens: 9_000,
      now: new Date(60_000),
      max_rate_per_second: RATE,
    });
    expect(out).toBe(500);
  });

  it('honors a custom max_rate_per_second override', () => {
    const out = clampHeartbeat({
      previous_tokens: 0,
      previous_heartbeat_iso: ISO(0),
      proposed_tokens: 10_000,
      now: new Date(10_000), // 10s
      max_rate_per_second: 100,
    });
    // ceiling = 0 + 100*10 = 1000
    expect(out).toBe(1_000);
  });

  it('uses the env var TOKEN_DERBY_MAX_RATE when no override is passed', () => {
    const prev = process.env.TOKEN_DERBY_MAX_RATE;
    process.env.TOKEN_DERBY_MAX_RATE = '50';
    try {
      const out = clampHeartbeat({
        previous_tokens: 0,
        previous_heartbeat_iso: ISO(0),
        proposed_tokens: 10_000,
        now: new Date(10_000), // 10s
      });
      // ceiling = 0 + 50 × 10 = 500
      expect(out).toBe(500);
    } finally {
      if (prev === undefined) delete process.env.TOKEN_DERBY_MAX_RATE;
      else process.env.TOKEN_DERBY_MAX_RATE = prev;
    }
  });
});
