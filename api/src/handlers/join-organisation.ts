import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { JoinOrganisationRequest, JoinOrganisationResponse } from '@token-derby/shared';
import { getOrganisationByJoinToken, addMember, isMember } from '../db/organisations.js';
import { ok, err, parseJson } from '../lib/http.js';
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

  const body = parseJson<JoinOrganisationRequest>(event.body);
  if (!body || typeof body.join_token !== 'string' || !body.join_token) {
    return err('BAD_REQUEST', 'join_token is required');
  }

  const org = await getOrganisationByJoinToken(body.join_token.trim());
  if (!org) return err('ORG_NOT_FOUND', 'No organisation matches that join token');

  // Idempotent — re-joining is a no-op that still returns the org info so the CLI
  // can tell the user which org they're in.
  if (!(await isMember(org.org_id, auth.user_id))) {
    await addMember(org.org_id, auth.user_id, auth.display_name, new Date().toISOString());
  }

  const response: JoinOrganisationResponse = { org_id: org.org_id, org_name: org.org_name };
  return ok(response);
};
