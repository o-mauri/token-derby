import type { ApiHandler } from '../lib/http.js';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisationByName } from '../db/organisations.js';
import { buildOrgLeaderboard } from '../lib/org-leaderboard.js';
import { ok, err } from '../lib/http.js';
import { readClient, readClientVersion, meetsMinimumVersion, versionMismatchMessage } from '../lib/version.js';

export const handler: ApiHandler = async (event) => {
  const client = readClient(event);
  const version = readClientVersion(event);
  if (version && !meetsMinimumVersion(client, version)) {
    return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) return err('BAD_REQUEST', 'Invalid organisation name');

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);

  const response = await buildOrgLeaderboard(org);
  return ok(response);
};
