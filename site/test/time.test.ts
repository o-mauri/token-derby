import { describe, it, expect } from 'vitest';
import { formatDuration, countdownSeconds, predictTimeLeftSeconds } from '../src/time.js';

describe('formatDuration', () => {
  it('zero seconds', () => {
    expect(formatDuration(0)).toBe('00:00:00');
  });

  it('under a minute', () => {
    expect(formatDuration(45)).toBe('00:00:45');
  });

  it('minutes and seconds', () => {
    expect(formatDuration(90)).toBe('00:01:30');
  });

  it('hours + minutes + seconds', () => {
    expect(formatDuration(3661)).toBe('01:01:01');
  });

  it('clamps negative durations to zero', () => {
    expect(formatDuration(-30)).toBe('00:00:00');
  });
});

describe('predictTimeLeftSeconds', () => {
  it('returns the anchor value at the moment of anchoring', () => {
    const anchor = { atMs: 1_000_000, timeLeftSeconds: 300 };
    expect(predictTimeLeftSeconds(anchor, 1_000_000)).toBe(300);
  });

  it('counts down by elapsed seconds between polls', () => {
    const anchor = { atMs: 1_000_000, timeLeftSeconds: 300 };
    expect(predictTimeLeftSeconds(anchor, 1_000_000 + 25_000)).toBe(275);
  });

  it('floors fractional seconds so the display ticks once per real second', () => {
    const anchor = { atMs: 1_000_000, timeLeftSeconds: 300 };
    expect(predictTimeLeftSeconds(anchor, 1_000_000 + 1_999)).toBe(299);
    expect(predictTimeLeftSeconds(anchor, 1_000_000 + 2_000)).toBe(298);
  });

  it('clamps to zero once predicted time runs out', () => {
    const anchor = { atMs: 1_000_000, timeLeftSeconds: 5 };
    expect(predictTimeLeftSeconds(anchor, 1_000_000 + 60_000)).toBe(0);
  });
});

describe('countdownSeconds', () => {
  it('returns positive when start_time is in the future', () => {
    const now = new Date('2026-04-22T08:59:30Z');
    expect(countdownSeconds('2026-04-22T09:00:00Z', now)).toBe(30);
  });

  it('returns 0 when start_time has passed', () => {
    const now = new Date('2026-04-22T09:01:00Z');
    expect(countdownSeconds('2026-04-22T09:00:00Z', now)).toBe(0);
  });
});
