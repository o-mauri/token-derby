import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { ListOrganisationsResponse } from '@token-derby/shared';
import { listOrganisationsForUser } from '../db/organisations.js';
import { ok, err } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, minCliVersion } from '../lib/version.js';
import { authenticate } from '../lib/auth.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const caller_version = readCliVersion(event);
  if (caller_version && !meetsMinimumCliVersion(caller_version)) {
    return err(
      'VERSION_MISMATCH',
      `This API requires token-derby v${minCliVersion()} or newer. ` +
        `Upgrade: npm i -g @mauricode/token-derby@latest`,
    );
  }

  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const organisations = await listOrganisationsForUser(auth.user_id);
  const response: ListOrganisationsResponse = { organisations };
  return ok(response);
};
