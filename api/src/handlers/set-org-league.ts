import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { SetOrgLeagueRequest, SetOrgLeagueResponse, League } from '@token-derby/shared';
import { ORG_NAME_PATTERN, parseSemver, validateLeagueConfig } from '@token-derby/shared';
import { getOrganisationByName } from '../db/organisations.js';
import { getSchedule } from '../db/schedules.js';
import { putLeague } from '../db/leagues.js';
import { isValidTimeZone } from '../lib/tz.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';
import { resolveCaller } from '../lib/auth.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  if (auth.source === 'cli') {
    const cli_version = readCliVersion(event);
    if (!cli_version) return err('BAD_REQUEST', 'X-Cli-Version header required — upgrade your CLI');
    if (!parseSemver(cli_version)) return err('BAD_REQUEST', `X-Cli-Version must be MAJOR.MINOR.PATCH (got "${cli_version}")`);
    if (!meetsMinimumCliVersion(cli_version)) return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) return err('BAD_REQUEST', 'Invalid organisation name');

  const body = parseJson<SetOrgLeagueRequest>(event.body);
  if (!body) return err('BAD_REQUEST', 'JSON body required');

  const invalid = validateLeagueConfig(body);
  if (invalid) return err('BAD_REQUEST', invalid);
  if (typeof body.tz !== 'string' || !isValidTimeZone(body.tz)) {
    return err('BAD_REQUEST', 'tz must be a valid IANA timezone');
  }

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);
  if (org.creator_user_id !== auth.user_id) {
    return err('NOT_ORG_OWNER', 'Only the organisation creator can manage the league');
  }

  // Mutual exclusivity: an org runs either a schedule or a league, never both.
  const schedule = await getSchedule(org.org_id);
  if (schedule) {
    return err('LEAGUE_CONFLICT', 'This organisation already has a race schedule. Delete it before configuring a league.');
  }

  const weekdays = [...new Set(body.weekdays)].sort((a, b) => a - b);
  const league: League = {
    org_id: org.org_id,
    divisions: body.divisions,
    racers_per_division: body.racers_per_division,
    races_per_season: body.races_per_season,
    promote_relegate_count: body.promote_relegate_count,
    weekdays,
    start_local: body.start_local,
    end_local: body.end_local,
    tz: body.tz,
    ...(body.race_name ? { race_name: body.race_name } : {}),
    ...(body.max_participants !== undefined ? { max_participants: body.max_participants } : {}),
    ...(body.counts_input ? { counts_input: true } : {}),
    ...(body.primary_top5 ? { primary_top5: true } : {}),
    current_season: 1,
    status: 'active',
    created_at: new Date().toISOString(),
    creator_user_id: auth.user_id,
    creator_user_name: auth.display_name,
  };
  await putLeague(league);

  const response: SetOrgLeagueResponse = { league };
  return ok(response);
};
