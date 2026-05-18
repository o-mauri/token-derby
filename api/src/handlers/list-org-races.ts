import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { ListOrgRacesResponse, RaceSummary } from '@token-derby/shared';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisationByName } from '../db/organisations.js';
import { listRacesByOrgId } from '../db/races.js';
import { computeStatus } from '../lib/status.js';
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
  const summaries: RaceSummary[] = races.map((race) => ({
    race_id: race.race_id,
    name: race.name,
    join_code: race.join_code,
    start_time: race.start_time,
    end_time: race.end_time,
    status: computeStatus(race, now),
    ...(race.ended_at ? { ended_at: race.ended_at } : {}),
  }));

  const response: ListOrgRacesResponse = {
    org_name: org.org_name,
    races: summaries,
  };
  return ok(response);
};
