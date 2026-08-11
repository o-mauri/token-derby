import type { ApiHandler } from '../lib/http.js';
import type { DeleteOrgLeagueResponse } from '@token-derby/shared';
import { ORG_NAME_PATTERN, parseSemver } from '@token-derby/shared';
import { getOrganisationByName } from '../db/organisations.js';
import { deleteLeague } from '../db/leagues.js';
import { ok, err } from '../lib/http.js';
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

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);
  if (org.creator_user_id !== auth.user_id) {
    return err('NOT_ORG_OWNER', 'Only the organisation creator can delete the league');
  }

  await deleteLeague(org.org_id); // idempotent — no-op when absent
  const response: DeleteOrgLeagueResponse = { ok: true };
  return ok(response);
};
