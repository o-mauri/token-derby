import type { Horse, HorseView } from '@token-derby/shared';

export function rankHorses(horses: Horse[]): HorseView[] {
  const sorted = [...horses].sort((a, b) => {
    if (b.current_tokens !== a.current_tokens) return b.current_tokens - a.current_tokens;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });
  return sorted.map((h, i) => ({ ...h, rank: i + 1 }));
}
