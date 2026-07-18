import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { ListOrganisationsResponse } from '@token-derby/shared';
import { listOrganisationsForUser } from '../db/organisations.js';
import { ok, err } from '../lib/http.js';
import { readClient, readClientVersion, meetsMinimumVersion, versionMismatchMessage } from '../lib/version.js';
import { resolveCaller } from '../lib/auth.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const client = readClient(event);
  const version = readClientVersion(event);
  if (version && !meetsMinimumVersion(client, version)) {
    return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const organisations = await listOrganisationsForUser(auth.user_id);
  const response: ListOrganisationsResponse = { organisations };
  return ok(response);
};
