export type Sample = { ts: number; tokens: number };

export const WINDOW_MS = 30 * 60_000;
export const MIN_SPAN_MS = 60_000;

export function appendSample(buf: readonly Sample[], ts: number, tokens: number): Sample[] {
  return [...buf, { ts, tokens }];
}

export function trimWindow(buf: readonly Sample[], now: number): Sample[] {
  const cutoff = now - WINDOW_MS;
  return buf.filter((s) => s.ts >= cutoff);
}

export function computePace(buf: readonly Sample[]): number | null {
  if (buf.length < 2) return null;
  const first = buf[0]!;
  const last = buf[buf.length - 1]!;
  const span = last.ts - first.ts;
  if (span < MIN_SPAN_MS) return null;
  const delta = last.tokens - first.tokens;
  if (delta <= 0) return 0;
  return Math.round(delta / (span / 60_000));
}
