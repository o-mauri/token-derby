import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { CreateRaceRequest, CreateRaceResponse, RaceCreatedEvent } from '@token-derby/shared';
import { DEFAULT_MAX_PARTICIPANTS, ORG_NAME_PATTERN, parseSemver } from '@token-derby/shared';
import { generateRaceId, generateJoinCode, generateAdminCode } from '../lib/codes.js';
import { putRace, getRaceByJoinCode } from '../db/races.js';
import { getOrganisationByName, isMember } from '../db/organisations.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';
import { authenticate } from '../lib/auth.js';
import { sendOrgWebhook } from '../lib/webhook.js';
import { randomUUID } from 'node:crypto';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const cli_version = readCliVersion(event);
  if (!cli_version) {
    return err('BAD_REQUEST', 'X-Cli-Version header required — upgrade your CLI');
  }
  if (!parseSemver(cli_version)) {
    return err('BAD_REQUEST', `X-Cli-Version must be MAJOR.MINOR.PATCH (got "${cli_version}")`);
  }
  if (!meetsMinimumCliVersion(cli_version)) {
    return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const body = parseJson<CreateRaceRequest>(event.body);
  if (!body) return err('BAD_REQUEST', 'JSON body required');

  if (
    !body.name ||
    !body.start_time ||
    !body.end_time ||
    !body.tz ||
    typeof body.name !== 'string' ||
    typeof body.start_time !== 'string' ||
    typeof body.end_time !== 'string' ||
    typeof body.tz !== 'string'
  ) {
    return err('BAD_REQUEST', 'name, start_time, end_time, tz are required');
  }

  const start_ms = new Date(body.start_time).getTime();
  const end_ms = new Date(body.end_time).getTime();
  if (Number.isNaN(start_ms) || Number.isNaN(end_ms)) {
    return err('BAD_REQUEST', 'start_time and end_time must be valid ISO 8601 datetimes');
  }

  if (end_ms <= start_ms) {
    return err('BAD_REQUEST', 'end_time must be after start_time');
  }

  let org: Awaited<ReturnType<typeof getOrganisationByName>> = null;
  if (body.organisation_name !== undefined && body.organisation_name !== '') {
    if (typeof body.organisation_name !== 'string' || !ORG_NAME_PATTERN.test(body.organisation_name)) {
      return err('BAD_REQUEST', 'organisation_name must be 1–12 alphanumeric characters');
    }
    org = await getOrganisationByName(body.organisation_name);
    if (!org) return err('ORG_NOT_FOUND', `No organisation named "${body.organisation_name}"`);
    if (!(await isMember(org.org_id, auth.user_id))) {
      return err('NOT_ORG_MEMBER', `You are not a member of "${org.org_name}"`);
    }
  }

  const join_code = await findUniqueJoinCode();
  const race_id = generateRaceId();
  const admin_code = generateAdminCode();
  const created_at = new Date().toISOString();
  const max_participants = body.max_participants ?? DEFAULT_MAX_PARTICIPANTS;

  await putRace(
    {
      race_id,
      name: body.name,
      start_time: body.start_time,
      end_time: body.end_time,
      tz: body.tz,
      max_participants,
      join_code,
      created_at,
      cli_version,
      creator_user_id: auth.user_id,
      creator_user_name: auth.display_name,
      ...(org ? { org_id: org.org_id, organisation_name: org.org_name } : {}),
      ...(body.counts_input ? { counts_input: true } : {}),
    },
    admin_code,
  );

  if (org) {
    const payload: RaceCreatedEvent = {
      event: 'race.created',
      delivery_id: randomUUID(),
      sent_at: created_at,
      organisation: { org_id: org.org_id, org_name: org.org_name },
      race: {
        race_id,
        name: body.name,
        join_code,
        start_time: body.start_time,
        end_time: body.end_time,
        tz: body.tz,
        max_participants,
        created_at,
        creator_user_id: auth.user_id,
        creator_user_name: auth.display_name,
      },
    };
    await sendOrgWebhook(org, 'race.created', payload);
  }

  const response: CreateRaceResponse = { race_id, join_code, admin_code };
  return ok(response);
};

async function findUniqueJoinCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateJoinCode();
    const existing = await getRaceByJoinCode(code);
    if (!existing) return code;
  }
  throw new Error('Could not generate unique join code after 10 attempts');
}
