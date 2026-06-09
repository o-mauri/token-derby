const ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

// Parse a CLI day spec like "mon-fri" or "mon,wed,fri" into sorted, deduped
// ISO weekday numbers (1=Mon .. 7=Sun). Returns null on any malformed token.
export function parseWeekdays(spec: string): number[] | null {
  const tokens = spec.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);
  if (tokens.length === 0) return null;
  const set = new Set<number>();
  for (const tok of tokens) {
    if (tok.includes('-')) {
      const parts = tok.split('-');
      if (parts.length !== 2) return null;
      const [a, b] = parts;
      const ai = ORDER.indexOf(a as (typeof ORDER)[number]);
      const bi = ORDER.indexOf(b as (typeof ORDER)[number]);
      if (ai < 0 || bi < 0 || ai > bi) return null;
      for (let i = ai; i <= bi; i++) set.add(i + 1);
    } else {
      const i = ORDER.indexOf(tok as (typeof ORDER)[number]);
      if (i < 0) return null;
      set.add(i + 1);
    }
  }
  return [...set].sort((x, y) => x - y);
}
