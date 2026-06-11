import { describe, it, expect } from 'vitest';
import { formatTokens, avgFinish } from '../src/format.js';

describe('formatTokens', () => {
  it('formats with K/M suffixes', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(540)).toBe('540');
    expect(formatTokens(540_000)).toBe('540K');
    expect(formatTokens(1_900_000)).toBe('1.9M');
    expect(formatTokens(undefined)).toBe('0');
  });
});

describe('avgFinish', () => {
  it('divides finishing position by races, or shows a dash', () => {
    expect(avgFinish(21, 10)).toBe('2.1');
    expect(avgFinish(0, 0)).toBe('—');
    expect(avgFinish(undefined, undefined)).toBe('—');
  });
});
