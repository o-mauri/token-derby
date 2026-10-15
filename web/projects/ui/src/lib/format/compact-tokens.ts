const UNITS: readonly [number, string][] = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

/** Token counts in short form: 3 significant figures in the largest unit that keeps the value at least 1. */
export function compactTokens(n: number): string {
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  for (let i = 0; i < UNITS.length; i++) {
    const [div, unit] = UNITS[i]!;
    if (a < div) continue;
    // Rounding can reach 1000 in this unit (999.95K); show it in the next unit up instead.
    if (Number((a / div).toPrecision(3)) >= 1000 && i > 0) return sign + (a / UNITS[i - 1]![0]).toPrecision(3) + UNITS[i - 1]![1];
    return sign + (a / div).toPrecision(3) + unit;
  }
  return sign + String(Math.round(a));
}
