import type { CollectedHat, HorseColors, HorseView, RaceView } from '@token-derby/shared';
import { scoredOf } from '@token-derby/shared';
import { divisionOf } from './race-divisions.js';

export type Standing = {
  rank: number;
  horse_id: string;
  name: string;
  tokens: number;
  colors: HorseColors;
  hat?: CollectedHat;
  isYou: boolean;
  isLeader: boolean;
  // League fixtures only; null on a standard race. Carried here so filtering by
  // division needs no second lookup into race.horses.
  division: number | null;
};

// SCORED distance, not raw tokens: the server ranks on scoredOf()
// (api/src/lib/rank-horses.ts) and the site positions horses on the track the
// same way, so showing raw here would let the list contradict its own order
// once a stamina multiplier has been applied.
//
// Finished races carry final_scored_tokens (stamped by finalise-race, which also
// ranks by it). The remaining fallbacks cover rows written before scoring
// existed: scored_tokens for a live race, then final_tokens, then raw.
export function tokensFor(race: RaceView, horse: HorseView): number {
  if (race.status === 'finished') {
    return horse.final_scored_tokens ?? horse.scored_tokens ?? horse.final_tokens ?? horse.current_tokens;
  }
  return scoredOf(horse);
}

// Pure mapping from a race + "your" stable horse ids to the standings list
// the Race tab renders: sorted by rank, leader flagged on rank 1, "you"
// flagged by matching each horse's persistent stable_horse_id (horse_id is
// only unique within this one race).
export function mapStandings(race: RaceView, yourStableHorseIds: ReadonlySet<string>): Standing[] {
  return [...race.horses]
    .sort((a, b) => a.rank - b.rank)
    .map((horse) => ({
      rank: horse.rank,
      horse_id: horse.horse_id,
      name: horse.name,
      tokens: tokensFor(race, horse),
      colors: horse.colors,
      hat: horse.equipped_hat,
      isYou: yourStableHorseIds.has(horse.stable_horse_id),
      isLeader: horse.rank === 1,
      division: divisionOf(race, horse),
    }));
}
