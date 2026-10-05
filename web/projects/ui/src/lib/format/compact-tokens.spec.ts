import { compactTokens } from './compact-tokens';

describe('compactTokens', () => {
  it.each([
    [4_210_000, '4.21M'], [830_000, '830K'], [62_400, '62.4K'], [12_100_000, '12.1M'],
    [1_930_000_000, '1.93B'], [999, '999'], [0, '0'], [1_000, '1.00K'], [7_210_000, '7.21M'],
  ])('shows %d as %s', (n, out) => expect(compactTokens(n)).toBe(out));

  it('moves up a unit rather than showing 1000K', () => {
    expect(compactTokens(999_950)).toBe('1.00M');
    expect(compactTokens(999_999_999)).toBe('1.00B');
  });

  it('keeps the sign of negative gaps', () => {
    expect(compactTokens(-830_000)).toBe('-830K');
  });
});
