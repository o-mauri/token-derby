import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { ListOrgRacesResponse, RaceSummary, RaceHighlight } from '@token-derby/shared';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisationByName } from '../db/organisations.js';
import { listRacesByOrgId } from '../db/races.js';
import { listHorses } from '../db/horses.js';
import { rankHorses } from '../lib/rank-horses.js';
import { computeStatus, timeLeftSeconds } from '../lib/status.js';
import { ok, err } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
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

  // Fan out per-race horse lookups concurrently (same pattern as
  // get-org-leaderboard.ts). Pending races skip the lookup entirely; a failed
  // lookup for one race just omits that race's highlight without failing the
  // whole request. This endpoint never triggers race finalization.
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

      try {
        const horses = await listHorses(race.race_id);
        // rankHorses sorts by current_tokens desc, joined_at asc. The top horse
        // is the winner (finished) or current leader (live). Zero-horse races
        // have no leader, so they get no highlight.
        const leader = rankHorses(horses)[0];
        if (!leader) return summary;
        const tokens =
          status === 'finished'
            ? leader.final_tokens ?? leader.current_tokens
            : leader.current_tokens;
        const highlight: RaceHighlight = {
          horse_name: leader.name,
          tokens,
          colors: leader.colors,
          ...(leader.equipped_hat ? { hat: leader.equipped_hat } : {}),
        };
        return { ...summary, highlight };
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
