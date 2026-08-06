import type { Horse, HorseView } from '@token-derby/shared';
import { scoredOf } from '@token-derby/shared';

export function rankHorses(horses: Horse[]): HorseView[] {
  const sorted = [...horses].sort((a, b) => {
    const bs = scoredOf(b), as = scoredOf(a);
    if (bs !== as) return bs - as;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });
  return sorted.map((h, i) => ({ ...h, rank: i + 1 }));
}
