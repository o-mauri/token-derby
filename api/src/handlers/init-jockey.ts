import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { InitJockeyRequest, InitJockeyResponse } from '@token-derby/shared';
import { USER_NAME_MAX_LENGTH, parseSemver } from '@token-derby/shared';
import { generateUserId, generateSecretToken } from '../lib/codes.js';
import { hashSecretToken } from '../lib/auth.js';
import { putUser } from '../db/users.js';
import { ok, err, parseJson } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, minCliVersion } from '../lib/version.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const cli_version = readCliVersion(event);
  if (!cli_version) {
    return err('BAD_REQUEST', 'X-Cli-Version header required — upgrade your CLI');
  }
  if (!parseSemver(cli_version)) {
    return err('BAD_REQUEST', `X-Cli-Version must be MAJOR.MINOR.PATCH (got "${cli_version}")`);
  }
  if (!meetsMinimumCliVersion(cli_version)) {
    return err(
      'VERSION_MISMATCH',
      `This API requires token-derby v${minCliVersion()} or newer. ` +
        `Upgrade: npm i -g @mauricode/token-derby@latest`,
    );
  }

  const body = parseJson<InitJockeyRequest>(event.body);
  if (!body || typeof body.display_name !== 'string') {
    return err('BAD_REQUEST', 'display_name is required');
  }
  const display_name = body.display_name.trim();
  if (display_name.length < 1 || display_name.length > USER_NAME_MAX_LENGTH) {
    return err('BAD_REQUEST', `display_name must be 1–${USER_NAME_MAX_LENGTH} characters`);
  }

  const user_id = generateUserId();
  const secret_token = generateSecretToken();
  await putUser(
    { user_id, display_name, created_at: new Date().toISOString() },
    hashSecretToken(secret_token),
  );

  const response: InitJockeyResponse = { user_id, display_name, secret_token };
  return ok(response);
};
