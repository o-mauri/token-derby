import type { Horse, Race } from '@token-derby/shared';
import { listHorses, setHorseFinalTokens } from '../db/horses.js';
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
//   2. Conditionally set ended_at on the race META (race-level election —
//      exactly one caller persists their timestamp).
// Doing final_tokens before ended_at means: if a caller crashes mid-stamp,
// the next finaliseRace call retries the missing stamps before declaring
// the race ended. ended_at == "everything was successfully stamped".
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

  const ended_at = await setRaceEndedIfAbsent(race.race_id, now.toISOString());

  return {
    race: { ...race, ended_at },
    horses: horses.map(h => (h.final_tokens === undefined ? { ...h, final_tokens: h.current_tokens } : h)),
    newly_finalised: ended_at === now.toISOString(),
  };
}
