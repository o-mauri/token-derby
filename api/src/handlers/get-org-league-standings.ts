import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { GetLeagueStandingsResponse } from '@token-derby/shared';
import { ORG_NAME_PATTERN, buildSeasonStandings } from '@token-derby/shared';
import { getOrganisationByName } from '../db/organisations.js';
import { getLeague } from '../db/leagues.js';
import { getLeagueSeason } from '../db/league-seasons.js';
import { listSeasonStandings } from '../db/league-standings.js';
import { ok, err } from '../lib/http.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) return err('BAD_REQUEST', 'Invalid organisation name');

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);

  const league = await getLeague(org.org_id);
  if (!league) {
    const response: GetLeagueStandingsResponse = { standings: null };
    return ok(response);
  }

  const season = league.current_season;
  const seasonRow = await getLeagueSeason(org.org_id, season);
  const standings = await listSeasonStandings(org.org_id, season);

  const response: GetLeagueStandingsResponse = {
    standings: buildSeasonStandings({
      org_name: org.org_name,
      divisions: league.divisions,
      promote_relegate_count: league.promote_relegate_count,
      races_per_season: league.races_per_season,
      season,
      round: seasonRow?.fixtures_materialised ?? 0,
      standings,
    }),
  };
  return ok(response);
};
