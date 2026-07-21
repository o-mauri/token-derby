// Ported unchanged from site/src/position.ts — pure horse-position math, no
// browser coupling. Duplicated rather than shared because it lives outside
// @token-derby/shared (it's a site/src-root file, not a package export); see
// time.ts alongside it for the same situation.
import type { HorseView } from '@token-derby/shared';

export function elapsedPct(start_time: string, end_time: string, now: Date): number {
  const s = new Date(start_time).getTime();
  const e = new Date(end_time).getTime();
  if (e <= s) return 0;
  const raw = (now.getTime() - s) / (e - s);
  return Math.max(0, Math.min(1, raw));
}

export function leaderTokens(horses: readonly HorseView[]): number {
  let max = 0;
  for (const h of horses) {
    if (h.current_tokens > max) max = h.current_tokens;
  }
  return max || 1;
}

export function horseXPct(
  horse: HorseView,
  horses: readonly HorseView[],
  elapsed: number,
): number {
  const leader = leaderTokens(horses);
  return (horse.current_tokens / leader) * elapsed * 100;
}
