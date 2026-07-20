// Compact token-count formatting for the race view: below 1000 shows the plain
// integer, above that a metric suffix (K/M/B/T) rendered to 3 significant
// figures — e.g. 1,234,567 -> "1.23M", 12,345 -> "12.3K", 123,456 -> "123K".
export function formatTokens(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1_000) return sign + String(Math.trunc(abs));

  const units: Array<{ v: number; s: string }> = [
    { v: 1_000_000_000_000, s: 'T' },
    { v: 1_000_000_000, s: 'B' },
    { v: 1_000_000, s: 'M' },
    { v: 1_000, s: 'K' },
  ];
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    if (abs >= u.v) {
      const text = threeSigFigs(abs / u.v);
      if (text === '1000') {
        // Rounding pushed it up into the next unit (e.g. 999,999 -> "1.00M").
        const bigger = units[i - 1];
        if (bigger) return `${sign}1.00${bigger.s}`;
      }
      return `${sign}${text}${u.s}`;
    }
  }
  return sign + String(Math.trunc(abs));
}

// Format a value >= 1 to exactly 3 significant figures, no scientific notation.
function threeSigFigs(x: number): string {
  if (x >= 100) return String(Math.round(x)); // 100–999
  if (x >= 10) {
    const r = Math.round(x * 10) / 10;
    return r >= 100 ? String(Math.round(r)) : r.toFixed(1); // 10.0–99.9
  }
  const r = Math.round(x * 100) / 100;
  return r >= 10 ? r.toFixed(1) : r.toFixed(2); // 1.00–9.99
}
