import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { SetOrgScheduleRequest, SetOrgScheduleResponse, RaceSchedule } from '@token-derby/shared';
import { ORG_NAME_PATTERN, parseSemver } from '@token-derby/shared';
import { getOrganisationByName } from '../db/organisations.js';
import { putSchedule } from '../db/schedules.js';
import { isValidTimeZone } from '../lib/tz.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';
import { resolveCaller } from '../lib/auth.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

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

  const body = parseJson<SetOrgScheduleRequest>(event.body);
  if (!body) return err('BAD_REQUEST', 'JSON body required');

  if (!Array.isArray(body.weekdays) || body.weekdays.length === 0 ||
      !body.weekdays.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) {
    return err('BAD_REQUEST', 'weekdays must be a non-empty array of integers 1–7 (1=Mon)');
  }
  if (typeof body.start_local !== 'string' || !HHMM.test(body.start_local)) {
    return err('BAD_REQUEST', 'start_local must be "HH:MM" (24h)');
  }
  if (typeof body.end_local !== 'string' || !HHMM.test(body.end_local)) {
    return err('BAD_REQUEST', 'end_local must be "HH:MM" (24h)');
  }
  if (body.end_local <= body.start_local) {
    return err('BAD_REQUEST', 'end_local must be after start_local');
  }
  if (typeof body.tz !== 'string' || !isValidTimeZone(body.tz)) {
    return err('BAD_REQUEST', 'tz must be a valid IANA timezone');
  }
  if (body.max_participants !== undefined &&
      (!Number.isInteger(body.max_participants) || body.max_participants < 1)) {
    return err('BAD_REQUEST', 'max_participants must be a positive integer');
  }

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);
  if (org.creator_user_id !== auth.user_id) {
    return err('NOT_ORG_OWNER', 'Only the organisation creator can manage the race schedule');
  }

  const weekdays = [...new Set(body.weekdays)].sort((a, b) => a - b);
  const schedule: RaceSchedule = {
    org_id: org.org_id,
    weekdays,
    start_local: body.start_local,
    end_local: body.end_local,
    tz: body.tz,
    ...(body.race_name ? { race_name: body.race_name } : {}),
    ...(body.max_participants !== undefined ? { max_participants: body.max_participants } : {}),
    ...(body.counts_input ? { counts_input: true } : {}),
    ...(body.primary_top5 ? { primary_top5: true } : {}),
    created_at: new Date().toISOString(),
    creator_user_id: auth.user_id,
    creator_user_name: auth.display_name,
  };
  await putSchedule(schedule);

  const response: SetOrgScheduleResponse = { schedule };
  return ok(response);
};
