import type { ApiHandler } from '../lib/http.js';
import type { SetOrgLeagueRequest, SetOrgLeagueResponse, League, PendingStructural } from '@token-derby/shared';
import { ORG_NAME_PATTERN, parseSemver, validateLeagueConfig } from '@token-derby/shared';
import { getOrganisationByName } from '../db/organisations.js';
import { getSchedule } from '../db/schedules.js';
import { getLeague, putLeague } from '../db/leagues.js';
import { isValidTimeZone } from '../lib/tz.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';
import { resolveCaller } from '../lib/auth.js';

export const handler: ApiHandler = async (event) => {
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

  const existing = await getLeague(org.org_id);

  if (!existing) {
    const league: League = {
      org_id: org.org_id,
      divisions: body.divisions,
      boundaries: body.boundaries,
      races_per_season: body.races_per_season,
      weekdays,
      start_local: body.start_local,
      end_local: body.end_local,
      tz: body.tz,
      ...(body.race_name ? { race_name: body.race_name } : {}),
      ...(body.max_participants !== undefined ? { max_participants: body.max_participants } : {}),
      ...(body.counts_input ? { counts_input: true } : {}),
      ...(body.primary_top5 ? { primary_top5: true } : {}),
      ...(body.stamina ? { stamina: true } : {}),
      current_season: 1,
      status: 'active',
      created_at: new Date().toISOString(),
      creator_user_id: auth.user_id,
      creator_user_name: auth.display_name,
    };
    await putLeague(league);
    const response: SetOrgLeagueResponse = { league };
    return ok(response);
  }

  // Existing league: apply live fields now; stage structural changes for next rollover.
  const structurallyEqual =
    JSON.stringify(existing.divisions) === JSON.stringify(body.divisions) &&
    JSON.stringify(existing.boundaries) === JSON.stringify(body.boundaries) &&
    existing.races_per_season === body.races_per_season;

  const pending: PendingStructural = {};
  if (JSON.stringify(existing.divisions) !== JSON.stringify(body.divisions)) pending.divisions = body.divisions;
  if (JSON.stringify(existing.boundaries) !== JSON.stringify(body.boundaries)) pending.boundaries = body.boundaries;
  if (existing.races_per_season !== body.races_per_season) pending.races_per_season = body.races_per_season;

  const updated: League = {
    ...existing,
    // live fields
    weekdays,
    start_local: body.start_local,
    end_local: body.end_local,
    tz: body.tz,
    // Optional live fields assigned directly (not conditionally spread): an omitted
    // field becomes `undefined`, which the doc client's removeUndefinedValues + a
    // full-item putLeague drops from the stored row — i.e. omission CLEARS it. If
    // putLeague ever moves to a partial UpdateCommand, switch these to conditional
    // spreads / explicit REMOVE, since SET :x=undefined would not clear them.
    race_name: body.race_name,
    max_participants: body.max_participants,
    counts_input: body.counts_input,
    primary_top5: body.primary_top5,
    stamina: body.stamina,
    // structural fields stay as the live (existing) shape; edits are staged
    ...(structurallyEqual ? {} : { pending_structural: pending }),
  };
  if (structurallyEqual) delete (updated as { pending_structural?: unknown }).pending_structural;
  await putLeague(updated);

  const response: SetOrgLeagueResponse = { league: updated };
  return ok(response);
};
