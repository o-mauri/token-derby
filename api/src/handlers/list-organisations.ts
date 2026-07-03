import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { ListOrganisationsResponse } from '@token-derby/shared';
import { listOrganisationsForUser } from '../db/organisations.js';
import { ok, err } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';
import { resolveCaller } from '../lib/auth.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const caller_version = readCliVersion(event);
  if (caller_version && !meetsMinimumCliVersion(caller_version)) {
    return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const organisations = await listOrganisationsForUser(auth.user_id);
  const response: ListOrganisationsResponse = { organisations };
  return ok(response);
};
