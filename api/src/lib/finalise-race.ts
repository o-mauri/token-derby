import type { Horse, Race, RaceEndedEvent } from '@token-derby/shared';
import { xpForRaceFinish, raceXpMultiplier } from '@token-derby/shared';
import { listHorses, setHorseFinalTokens, setHorseXpAwarded } from '../db/horses.js';
import { awardHorseXp, recordHorseRaceResult } from '../db/stable.js';
import { setRaceEndedIfAbsent } from '../db/races.js';
import { getOrganisationById } from '../db/organisations.js';
import { sendOrgWebhook } from './webhook.js';
import { scoreLeagueRace } from './score-league-race.js';
import { randomUUID } from 'node:crypto';

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

  // Anti-farm gate: persistent XP (the currency that buys hat rolls) is only
  // awarded for a real, sustained competition. A solo or instant self-race —
  // the natural successor to the "infinite horses" farm — earns nothing.
  //   • Distinct jockeys: count unique jockeys, not horses (a single user can
  //     only field one horse per race, but counting users is the robust check).
  //   • Duration: measured from when the race actually went live to *now* (the
  //     finalisation instant). live-start is clamped to created_at so a
  //     back-dated start_time can't fake hours of elapsed time — the only
  //     server-trusted anchors are created_at and the finalisation time.
  const distinct_jockeys = new Set(
    stamped.map(h => h.user_id).filter((id): id is string => Boolean(id)),
  ).size;
  const startMs = new Date(race.start_time).getTime();
  const createdMs = new Date(race.created_at).getTime();
  const liveStartMs = Math.max(
    Number.isFinite(startMs) ? startMs : createdMs,
    Number.isFinite(createdMs) ? createdMs : startMs,
  );
  const duration_ms = Math.max(0, now.getTime() - liveStartMs);
  const xp_multiplier = raceXpMultiplier({ distinct_jockeys, duration_ms });

  await Promise.all(ranked.map(async (h, i) => {
    const rank = i + 1;
    const xp = Math.round(xpForRaceFinish(rank, h.final_tokens, winner_tokens, h.live_xp) * xp_multiplier);
    const isFirstAward = await setHorseXpAwarded(race.race_id, h.horse_id, xp);
    if (isFirstAward && h.user_id && h.stable_horse_id) {
      await Promise.all([
        awardHorseXp(h.user_id, h.stable_horse_id, xp),
        recordHorseRaceResult(h.user_id, h.stable_horse_id, {
          final_tokens: h.final_tokens,
          rank,
        }),
      ]);
    }
  }));

  // League fixtures: award division points into the season standings. Idempotent
  // per (horse, round), so a re-finalisation or lazy-finalise retry is safe.
  if (race.league_id) {
    await scoreLeagueRace(race, stamped);
  }

  const ended_at = await setRaceEndedIfAbsent(race.race_id, now.toISOString());

  const newly_finalised = ended_at === now.toISOString();
  if (newly_finalised && race.org_id) {
    const org = await getOrganisationById(race.org_id);
    if (org && org.webhook_url) {
      const results = ranked.map((h, i) => ({
        rank: i + 1,
        horse_id: h.horse_id,
        stable_horse_id: h.stable_horse_id,
        name: h.name,
        colors: h.colors,
        final_tokens: h.final_tokens,
        xp_awarded: Math.round(xpForRaceFinish(i + 1, h.final_tokens, winner_tokens, h.live_xp) * xp_multiplier),
        user_id: h.user_id,
        user_name: h.user_name,
      }));
      const payload: RaceEndedEvent = {
        event: 'race.ended',
        delivery_id: randomUUID(),
        sent_at: now.toISOString(),
        organisation: { org_id: org.org_id, org_name: org.org_name },
        race: {
          race_id: race.race_id,
          name: race.name,
          join_code: race.join_code,
          start_time: race.start_time,
          end_time: race.end_time,
          tz: race.tz,
          created_at: race.created_at,
          ended_at,
        },
        results,
      };
      await sendOrgWebhook(org, 'race.ended', payload);
    }
  }

  return {
    race: { ...race, ended_at },
    horses: horses.map(h => (h.final_tokens === undefined ? { ...h, final_tokens: h.current_tokens } : h)),
    newly_finalised,
  };
}
