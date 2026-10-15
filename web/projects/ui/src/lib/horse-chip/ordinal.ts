// 1 → "1st", 2 → "2nd", 11 → "11th", 21 → "21st" …
export function ordinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

const MEDALS = ['gold', 'silver', 'bronze'] as const;

/** The medal colour for a podium place, else 'place'. */
export function medalOf(position: number): (typeof MEDALS)[number] | 'place' {
  return MEDALS[position - 1] ?? 'place';
}
