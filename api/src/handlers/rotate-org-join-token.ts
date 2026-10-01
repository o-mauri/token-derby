import type { ApiHandler } from '../lib/http.js';
import type { RotateOrgJoinTokenResponse } from '@token-derby/shared';
import { ORG_NAME_PATTERN } from '@token-derby/shared';
import { getOrganisationByName, rotateJoinToken } from '../db/organisations.js';
import { ok, err } from '../lib/http.js';
import { resolveCaller } from '../lib/auth.js';

// Deliberately its own handler rather than a flag on PUT .../access:
//
// 1. A PUT is retryable by definition, and a retried rotation issues a second
//    token. The caller only ever sees one response, so the token it shows the
//    owner would be the dead one — precisely the failure this feature exists to
//    prevent. POST carries no such promise.
// 2. A rotate folded into the settings PUT could not happen without also
//    writing the four access fields, so rotating from a stale form would
//    silently revert a setting somebody else had just changed. Rotation must
//    not be able to touch access settings at all.
//
// It writes nothing but `org_join_token`, so `join_token_enabled` is untouched:
// rotating a disabled token is legal and leaves it disabled.
export const handler: ApiHandler = async (event) => {
  const auth = await resolveCaller(event);
  if ('error' in auth) return err('UNAUTHENTICATED', auth.error);

  const raw = event.pathParameters?.org_name;
  if (!raw) return err('BAD_REQUEST', 'org_name path parameter required');
  const org_name = decodeURIComponent(raw);
  if (!ORG_NAME_PATTERN.test(org_name)) return err('BAD_REQUEST', 'Invalid organisation name');

  const org = await getOrganisationByName(org_name);
  if (!org) return err('ORG_NOT_FOUND', `No organisation named "${org_name}"`);
  if (org.creator_user_id !== auth.user_id) {
    return err('NOT_ORG_OWNER', 'Only the organisation creator can rotate the join token');
  }

  const org_join_token = await rotateJoinToken(org.org_id);

  const response: RotateOrgJoinTokenResponse = { org_join_token };
  return ok(response);
};
