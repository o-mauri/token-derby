import { describe, it, expect } from 'vitest';
import { appendSample, trimWindow, computePace, WINDOW_MS, MIN_SPAN_MS } from '../src/render/pace.js';

const MIN = 60_000;

describe('appendSample', () => {
  it('appends to an empty buffer', () => {
    const buf = appendSample([], 1_000, 100);
    expect(buf).toEqual([{ ts: 1_000, tokens: 100 }]);
  });

  it('appends to a non-empty buffer', () => {
    const buf = appendSample([{ ts: 1_000, tokens: 100 }], 2_000, 250);
    expect(buf).toEqual([
      { ts: 1_000, tokens: 100 },
      { ts: 2_000, tokens: 250 },
    ]);
  });
});

describe('trimWindow', () => {
  it('drops entries older than now − WINDOW_MS', () => {
    const now = 100 * MIN;
    const buf = [
      { ts: now - 31 * MIN, tokens: 0 },
      { ts: now - 29 * MIN, tokens: 50 },
      { ts: now - 5 * MIN, tokens: 200 },
      { ts: now, tokens: 400 },
    ];
    expect(trimWindow(buf, now)).toEqual([
      { ts: now - 29 * MIN, tokens: 50 },
      { ts: now - 5 * MIN, tokens: 200 },
      { ts: now, tokens: 400 },
    ]);
  });

  it('keeps entries exactly at the window boundary', () => {
    const now = 60 * MIN;
    const buf = [{ ts: now - WINDOW_MS, tokens: 10 }, { ts: now, tokens: 20 }];
    expect(trimWindow(buf, now)).toEqual(buf);
  });

  it('returns empty when all entries are stale', () => {
    const now = 100 * MIN;
    const buf = [{ ts: now - 50 * MIN, tokens: 10 }];
    expect(trimWindow(buf, now)).toEqual([]);
  });
});

describe('computePace', () => {
  it('returns null for empty buffer', () => {
    expect(computePace([])).toBeNull();
  });

  it('returns null for a single sample', () => {
    expect(computePace([{ ts: 1_000, tokens: 100 }])).toBeNull();
  });

  it('returns null when span is less than MIN_SPAN_MS', () => {
    const buf = [
      { ts: 0, tokens: 0 },
      { ts: MIN_SPAN_MS - 1, tokens: 1_000 },
    ];
    expect(computePace(buf)).toBeNull();
  });

  it('computes pace at exactly the 60s minimum span', () => {
    const buf = [
      { ts: 0, tokens: 0 },
      { ts: MIN, tokens: 300 },
    ];
    expect(computePace(buf)).toBe(300);
  });

  it('computes pace over a 30-min span', () => {
    const buf = [
      { ts: 0, tokens: 1_000 },
      { ts: 30 * MIN, tokens: 8_500 },
    ];
    expect(computePace(buf)).toBe(250);
  });

  it('uses first and last samples (ignores middle for delta)', () => {
    const buf = [
      { ts: 0, tokens: 100 },
      { ts: 5 * MIN, tokens: 9_999 },
      { ts: 10 * MIN, tokens: 2_100 },
    ];
    expect(computePace(buf)).toBe(200);
  });

  it('rounds to integer', () => {
    const buf = [
      { ts: 0, tokens: 0 },
      { ts: 3 * MIN, tokens: 1_000 },
    ];
    expect(computePace(buf)).toBe(333);
  });

  it('clamps negative deltas to 0', () => {
    const buf = [
      { ts: 0, tokens: 500 },
      { ts: 5 * MIN, tokens: 100 },
    ];
    expect(computePace(buf)).toBe(0);
  });
});
