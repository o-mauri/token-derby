import type { ApiHandler } from '../lib/http.js';
import type { ListOrgRacesResponse, RaceSummary } from '@token-derby/shared';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisationByName } from '../db/organisations.js';
import { listRacesByOrgId } from '../db/races.js';
import { listHorses } from '../db/horses.js';
import { raceResultOf } from '../lib/race-result.js';
import { computeStatus, timeLeftSeconds } from '../lib/status.js';
import { ok, err } from '../lib/http.js';

export const handler: ApiHandler = async (event) => {
  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) {
    return err('BAD_REQUEST', 'Invalid organisation name');
  }

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);

  const now = new Date();
  const races = await listRacesByOrgId(org.org_id);

  // Pending races skip the horse lookup, as do finalised races (they carry their result).
  // A failed lookup omits that race's highlight without failing the request.
  // This endpoint never triggers race finalization.
  const summaries: RaceSummary[] = await Promise.all(
    races.map(async (race): Promise<RaceSummary> => {
      const status = computeStatus(race, now);
      const summary: RaceSummary = {
        race_id: race.race_id,
        name: race.name,
        join_code: race.join_code,
        start_time: race.start_time,
        end_time: race.end_time,
        status,
        ...(race.ended_at ? { ended_at: race.ended_at } : {}),
        ...(status === 'live' ? { time_left_seconds: timeLeftSeconds(race, now) } : {}),
      };

      if (status === 'pending') return summary;
      // Finalised races carry their result, so only live and unfinalised races read their horses.
      if (status === 'finished' && race.result) return { ...summary, ...race.result };

      try {
        return { ...summary, ...raceResultOf(await listHorses(race.race_id), status) };
      } catch {
        // Tolerate a per-race lookup failure: omit highlight, keep the summary
        // (including time_left_seconds for live races).
        return summary;
      }
    }),
  );

  const response: ListOrgRacesResponse = {
    org_name: org.org_name,
    races: summaries,
  };
  return ok(response);
};
