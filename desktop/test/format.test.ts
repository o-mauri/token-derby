import { describe, it, expect } from 'vitest';
import { formatTokens } from '../src/lib/format.js';

describe('formatTokens', () => {
  it('leaves sub-1000 counts as plain integers', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(0)).toBe('0');
  });

  it('formats thousands with a K suffix', () => {
    expect(formatTokens(1_500)).toBe('1.5K');
    expect(formatTokens(2_000)).toBe('2K');
  });

  it('formats millions with an M suffix', () => {
    expect(formatTokens(1_200_000)).toBe('1.2M');
    expect(formatTokens(3_000_000)).toBe('3M');
  });

  it('formats billions with a B suffix', () => {
    expect(formatTokens(2_500_000_000)).toBe('2.5B');
  });

  it('preserves the sign for negative values', () => {
    expect(formatTokens(-1_200_000)).toBe('-1.2M');
    expect(formatTokens(-42)).toBe('-42');
  });
});
