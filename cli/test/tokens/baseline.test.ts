import { describe, it, expect } from 'vitest';
import {
  initialBaseline,
  rejoinBaseline,
  currentRaceTokens,
} from '../../src/tokens/baseline.js';

describe('initialBaseline', () => {
  it('returns the running total when status is live', () => {
    expect(initialBaseline({ runningTotal: 5000, status: 'live' })).toBe(5000);
  });

  it('returns the running total when status is pending', () => {
    expect(initialBaseline({ runningTotal: 5000, status: 'pending' })).toBe(5000);
  });
});

describe('rejoinBaseline', () => {
  it('returns runningTotal - lastRaceTokens', () => {
    expect(rejoinBaseline({ runningTotal: 12_000, lastRaceTokens: 3_000 })).toBe(9_000);
  });

  it('clamps to 0 when lastRaceTokens > runningTotal (transcript pruned)', () => {
    expect(rejoinBaseline({ runningTotal: 1_000, lastRaceTokens: 5_000 })).toBe(0);
  });
});

describe('currentRaceTokens', () => {
  it('returns runningTotal - baseline', () => {
    expect(currentRaceTokens(8_500, 5_000)).toBe(3_500);
  });

  it('clamps to 0 if baseline > runningTotal', () => {
    expect(currentRaceTokens(4_000, 5_000)).toBe(0);
  });

  it('returns 0 when status is pending (race has not started)', () => {
    expect(currentRaceTokens(8_000, 5_000)).toBe(3_000);
  });
});
