import type { ApiHandler } from '../lib/http.js';
import type { CreateOrganisationRequest, CreateOrganisationResponse } from '@token-derby/shared';
import { ORG_NAME_PATTERN, ORG_NAME_MAX_LENGTH, parseSemver } from '@token-derby/shared';
import { generateOrgId, generateOrgJoinToken } from '../lib/codes.js';
import { putOrganisation, getOrganisationByName, addMember } from '../db/organisations.js';
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

  const body = parseJson<CreateOrganisationRequest>(event.body);
  if (!body || typeof body.name !== 'string') {
    return err('BAD_REQUEST', 'name is required');
  }
  const name = body.name.trim();
  if (!ORG_NAME_PATTERN.test(name)) {
    return err(
      'BAD_REQUEST',
      `Organisation name must be 1–${ORG_NAME_MAX_LENGTH} alphanumeric characters (no spaces or symbols)`,
    );
  }

  const existing = await getOrganisationByName(name);
  if (existing) return err('ORG_NAME_TAKEN', `Organisation "${name}" already exists`);

  const org_id = generateOrgId();
  const org_join_token = generateOrgJoinToken();
  const now = new Date().toISOString();

  await putOrganisation(
    {
      org_id,
      org_name: name,
      created_at: now,
      creator_user_id: auth.user_id,
      creator_user_name: auth.display_name,
    },
    org_join_token,
  );

  await addMember(org_id, auth.user_id, now);

  const response: CreateOrganisationResponse = { org_id, org_name: name, org_join_token };
  return ok(response);
};
