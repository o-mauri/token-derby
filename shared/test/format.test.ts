import { describe, it, expect } from 'vitest';
import { formatTokens } from '../src/format.js';

describe('formatTokens', () => {
  it('leaves sub-1000 counts as plain integers', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(0)).toBe('0');
  });

  it('renders 3 significant figures with a K suffix', () => {
    expect(formatTokens(1_500)).toBe('1.50K');
    expect(formatTokens(2_000)).toBe('2.00K');
    expect(formatTokens(12_345)).toBe('12.3K');
    expect(formatTokens(123_456)).toBe('123K');
  });

  it('renders 3 significant figures with an M suffix', () => {
    expect(formatTokens(1_234_567)).toBe('1.23M');
    expect(formatTokens(1_200_000)).toBe('1.20M');
    expect(formatTokens(3_000_000)).toBe('3.00M');
    expect(formatTokens(45_600_000)).toBe('45.6M');
  });

  it('renders 3 significant figures with a B suffix', () => {
    expect(formatTokens(2_500_000_000)).toBe('2.50B');
  });

  it('promotes to the next unit when rounding crosses the boundary', () => {
    expect(formatTokens(999_999)).toBe('1.00M');
    expect(formatTokens(999_500)).toBe('1.00M');
    expect(formatTokens(999_999_999)).toBe('1.00B');
  });

  it('preserves the sign for negative values', () => {
    expect(formatTokens(-1_234_567)).toBe('-1.23M');
    expect(formatTokens(-42)).toBe('-42');
  });
});
