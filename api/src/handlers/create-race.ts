import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { CreateRaceRequest, CreateRaceResponse } from '@token-derby/shared';
import { DEFAULT_MAX_PARTICIPANTS, parseSemver } from '@token-derby/shared';
import { generateRaceId, generateJoinCode, generateAdminCode } from '../lib/codes.js';
import { putRace, getRaceByJoinCode } from '../db/races.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion } from '../lib/version.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const cli_version = readCliVersion(event);
  if (!cli_version) {
    return err('BAD_REQUEST', 'X-Cli-Version header required — upgrade your CLI');
  }
  if (!parseSemver(cli_version)) {
    return err('BAD_REQUEST', `X-Cli-Version must be MAJOR.MINOR.PATCH (got "${cli_version}")`);
  }

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

  const join_code = await findUniqueJoinCode();
  const race_id = generateRaceId();
  const admin_code = generateAdminCode();

  await putRace(
    {
      race_id,
      name: body.name,
      start_time: body.start_time,
      end_time: body.end_time,
      tz: body.tz,
      max_participants: body.max_participants ?? DEFAULT_MAX_PARTICIPANTS,
      join_code,
      created_at: new Date().toISOString(),
      cli_version,
    },
    admin_code,
  );

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
