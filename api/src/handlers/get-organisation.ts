import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { GetOrganisationResponse } from '@token-derby/shared';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisationByName, isMember } from '../db/organisations.js';
import { ok, err } from '../lib/http.js';
import { readCliVersion, meetsMinimumCliVersion, versionMismatchMessage } from '../lib/version.js';
import { authenticate } from '../lib/auth.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const caller_version = readCliVersion(event);
  if (caller_version && !meetsMinimumCliVersion(caller_version)) {
    return err('VERSION_MISMATCH', versionMismatchMessage());
  }

  const auth = await authenticate(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) {
    return err('BAD_REQUEST', 'Invalid organisation name');
  }

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);

  // Join token is a secret — only members may see it. Non-members get a 403
  // rather than 404 so they can't probe org existence via this endpoint.
  if (!(await isMember(org.org_id, auth.user_id))) {
    return err('NOT_ORG_MEMBER', 'You are not a member of this organisation');
  }

  const response: GetOrganisationResponse = {
    org_id: org.org_id,
    org_name: org.org_name,
    org_join_token: org.org_join_token,
    created_at: org.created_at,
    creator_user_name: org.creator_user_name,
  };
  return ok(response);
};
