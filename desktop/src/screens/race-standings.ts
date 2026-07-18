import type { CollectedHat, HorseColors, HorseView, RaceView } from '@token-derby/shared';

export type Standing = {
  rank: number;
  horse_id: string;
  name: string;
  tokens: number;
  colors: HorseColors;
  hat?: CollectedHat;
  isYou: boolean;
  isLeader: boolean;
};

// Once a race has finished, final_tokens is the authoritative score (falling
// back to current_tokens for older rows); live/pending races only ever have
// current_tokens. Mirrors the same rule used for RaceHighlight elsewhere.
function tokensFor(race: RaceView, horse: HorseView): number {
  if (race.status === 'finished') return horse.final_tokens ?? horse.current_tokens;
  return horse.current_tokens;
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
    }));
}
