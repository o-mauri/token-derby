// Compact token-count formatting: below 1000 shows the plain integer, above
// that a metric suffix (K/M/B) with at most one decimal place.
export function formatTokens(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);

  if (abs >= 1_000_000_000) return sign + scale(abs, 1_000_000_000, 'B');
  if (abs >= 1_000_000) return sign + scale(abs, 1_000_000, 'M');
  if (abs >= 1_000) return sign + scale(abs, 1_000, 'K');
  return sign + String(Math.trunc(abs));
}

function scale(abs: number, divisor: number, suffix: string): string {
  const rounded = Math.round((abs / divisor) * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}${suffix}`;
}
