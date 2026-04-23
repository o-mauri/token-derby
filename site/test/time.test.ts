import { describe, it, expect } from 'vitest';
import { formatDuration, countdownSeconds } from '../src/time.js';

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
