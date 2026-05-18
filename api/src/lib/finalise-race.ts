import type { Horse, Race } from '@token-derby/shared';
import { xpForRaceResult, xpForTokenBonus } from '@token-derby/shared';
import { listHorses, setHorseFinalTokens, setHorseXpAwarded } from '../db/horses.js';
import { awardHorseXp } from '../db/stable.js';
import { setRaceEndedIfAbsent } from '../db/races.js';

export type FinaliseResult = {
  race: Race;
  horses: Horse[];
  newly_finalised: boolean;
};

// Single canonical entry point for "this race is over". Idempotent and
// safe under concurrent callers. Order matters:
//   1. Stamp final_tokens for each horse (conditional per-horse — repeat
//      callers no-op).
//   2. Compute ranks from the now-stamped tokens and award XP per horse
//      (conditional per-horse via xp_awarded marker — repeat callers no-op).
//   3. Conditionally set ended_at on the race META (race-level election —
//      exactly one caller persists their timestamp).
// Doing the per-horse work before ended_at means: if a caller crashes
// mid-stamp, the next finaliseRace call retries the missing work before
// declaring the race ended. ended_at == "everything was successfully stamped".
export async function finaliseRace(race: Race, now: Date): Promise<FinaliseResult> {
  if (race.ended_at) {
    const horses = await listHorses(race.race_id);
    return { race, horses, newly_finalised: false };
  }

  const horses = await listHorses(race.race_id);
  await Promise.all(
    horses.map(h =>
      h.final_tokens === undefined
        ? setHorseFinalTokens(race.race_id, h.horse_id, h.current_tokens)
        : Promise.resolve(),
    ),
  );

  // Rank by final_tokens (using current_tokens for horses we just stamped),
  // tie-break by earlier join time — same rule as the live race view.
  const stamped = horses.map(h => ({ ...h, final_tokens: h.final_tokens ?? h.current_tokens }));
  const ranked = [...stamped].sort((a, b) => {
    if (b.final_tokens !== a.final_tokens) return b.final_tokens - a.final_tokens;
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
  });
  const winner_tokens = ranked[0]?.final_tokens ?? 0;
  await Promise.all(ranked.map(async (h, i) => {
    const rank = i + 1;
    const xp = xpForRaceResult(rank) + xpForTokenBonus(rank, h.final_tokens, winner_tokens);
    const isFirstAward = await setHorseXpAwarded(race.race_id, h.horse_id, xp);
    if (isFirstAward && h.user_id && h.stable_horse_id) {
      await awardHorseXp(h.user_id, h.stable_horse_id, xp);
    }
  }));

  const ended_at = await setRaceEndedIfAbsent(race.race_id, now.toISOString());

  return {
    race: { ...race, ended_at },
    horses: horses.map(h => (h.final_tokens === undefined ? { ...h, final_tokens: h.current_tokens } : h)),
    newly_finalised: ended_at === now.toISOString(),
  };
}
