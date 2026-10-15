import type { Horse, RaceResult } from '@token-derby/shared';
import { scoredOf } from '@token-derby/shared';
import { rankHorses } from './rank-horses.js';

/** Field size, total scored tokens and leader (live) or winner (finished) for a race's horses. */
export function raceResultOf(horses: Horse[], status: 'live' | 'finished'): RaceResult {
  const result: RaceResult = {
    runners: horses.length,
    total_tokens: horses.reduce((sum, h) => sum + (h.final_scored_tokens ?? scoredOf(h)), 0),
  };
  const leader = rankHorses(horses)[0];
  if (!leader) return result;
  return {
    ...result,
    highlight: {
      horse_name: leader.name,
      tokens: status === 'finished' ? leader.final_scored_tokens ?? scoredOf(leader) : scoredOf(leader),
      colors: leader.colors,
      ...(leader.equipped_hat ? { hat: leader.equipped_hat } : {}),
    },
  };
}
