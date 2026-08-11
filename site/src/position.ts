import type { HorseView } from '@token-derby/shared';
import { scoredOf } from '@token-derby/shared';

export function elapsedPct(start_time: string, end_time: string, now: Date): number {
  const s = new Date(start_time).getTime();
  const e = new Date(end_time).getTime();
  if (e <= s) return 0;
  const raw = (now.getTime() - s) / (e - s);
  return Math.max(0, Math.min(1, raw));
}

// Scored, not raw, distance — a tired horse's lane position must match its
// scored token count everywhere else on the page.
export function leaderTokens(horses: readonly HorseView[]): number {
  let max = 0;
  for (const h of horses) {
    const scored = scoredOf(h);
    if (scored > max) max = scored;
  }
  return max || 1;
}

export function horseXPct(
  horse: HorseView,
  horses: readonly HorseView[],
  elapsed: number,
): number {
  const leader = leaderTokens(horses);
  return (scoredOf(horse) / leader) * elapsed * 100;
}
